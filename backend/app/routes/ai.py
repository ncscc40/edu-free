"""AI routes — video analysis, document analysis, chatbot, flashcards.

Every analysis result and flashcard set is persisted in the DB so students
can retrieve them later without re-running the AI.
"""

from datetime import datetime
import json
import re
from flask import Blueprint, request, current_app, Response
from flask_jwt_extended import get_jwt, get_jwt_identity
from pathlib import Path

from ..extensions import db, limiter
from ..models import (
    AIAnalysis,
    AIChatHistory,
    AIFlashcard,
    Course,
    CourseResource,
    User,
)
from ..services.ai_service import (
    analyze_document,
    analyze_document_from_url,
    analyze_video_content,
    build_course_context,
    chat_with_ai,
    read_text_file,
    summarize_video_from_url,
    SUPPORTED_TRANSLATION_LANGS,
    transcribe_audio,
    translate_analysis,
    translate_flashcards,
)
from ..utils.decorators import role_required
from ..utils.responses import error_response, success_response


ai_bp = Blueprint("ai", __name__)

VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv", ".avi"}
DOCUMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".md",
    ".csv", ".rtf", ".json", ".xml", ".yaml", ".yml",
}


# ── helpers ──────────────────────────────────────────────────────────────

def _get_student() -> User | None:
    user = User.query.get(int(get_jwt_identity()))
    return user if user and user.role == "student" else None


def _is_video_url(url: str) -> bool:
    lower = url.lower()
    if any(ext in lower for ext in VIDEO_EXTENSIONS):
        return True
    return any(d in lower for d in ("youtube.com", "youtu.be", "vimeo.com"))


def _is_local_file(url_or_path: str) -> bool:
    return not url_or_path.startswith("http://") and not url_or_path.startswith("https://")


def _authorize_resource(student: User, resource_id: int):
    """Return (resource, course) or (None, None)."""
    resource = CourseResource.query.get(resource_id)
    if not resource:
        return None, None
    course = resource.course
    if course.department_id != student.department_id:
        return None, None
    return resource, course


# Plain-text section keys the LLM may use (unquoted or quoted)
_SECTION_KEYS_DOC = ["important_points", "key_definitions", "study_tips"]
_SECTION_KEYS_VIDEO = ["key_points", "follow_up_questions"]
_ALL_SECTION_KEYS = _SECTION_KEYS_DOC + _SECTION_KEYS_VIDEO


def _extract_plain_text_sections(raw: str) -> dict:
    """Parse AI output that uses plain-text format like:

        Prose summary text here.
        important_points: [ item1, item2, ... ]
        key_definitions: [ { term: X, definition: Y }, ... ]
        study_tips: [ tip1, tip2 ]

    Returns a dict with summary + available section keys.
    """
    # Build a pattern that matches any section header
    key_pattern = "|".join(_ALL_SECTION_KEYS)
    header_re = re.compile(
        r'^\s*"?(' + key_pattern + r')"?\s*:\s*',
        re.IGNORECASE | re.MULTILINE,
    )

    first_match = header_re.search(raw)
    if not first_match:
        return {}

    prose = raw[: first_match.start()].strip().strip('"').strip(",").strip()
    result: dict = {"summary": prose}

    # Split the remainder by section headers
    headers = list(header_re.finditer(raw))
    for i, m in enumerate(headers):
        key = m.group(1).lower()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(raw)
        block = raw[m.end(): end].strip().rstrip(",").strip()

        if key == "key_definitions":
            result[key] = _parse_definitions_block(block)
        else:
            result[key] = _parse_list_block(block)

    return result


def _parse_list_block(block: str) -> list:
    """Turn a plain [ item, item ] or JSON array block into a Python list."""
    # Try JSON first
    try:
        candidate = block
        if not candidate.startswith("["):
            candidate = "[" + candidate + "]"
        parsed = json.loads(candidate)
        if isinstance(parsed, list):
            return [str(item).strip().strip('"') for item in parsed if item]
    except Exception:
        pass

    # Strip enclosing brackets and split on commas not inside braces
    inner = re.sub(r'^\[\s*', "", block)
    inner = re.sub(r'\s*\]$', "", inner)
    if not inner.strip():
        return []

    items = re.split(r',(?![^\[\]{}]*[\]\}])', inner)
    return [
        item.strip().strip('"').strip("'").strip(",").strip()
        for item in items
        if item.strip().strip('"').strip("'").strip(",").strip()
    ]


def _parse_definitions_block(block: str) -> list:
    """Turn a plain [ { term: X, definition: Y } ] block into a list of dicts."""
    # Try JSON first
    try:
        candidate = block
        if not candidate.startswith("["):
            candidate = "[" + candidate + "]"
        parsed = json.loads(candidate)
        if isinstance(parsed, list):
            return [
                {"term": str(d.get("term", "")).strip(),
                 "definition": str(d.get("definition", "")).strip()}
                for d in parsed
                if isinstance(d, dict)
            ]
    except Exception:
        pass

    # Regex-based fallback: find { term: X, definition: Y } blocks
    defs = []
    for obj_match in re.finditer(r'\{([^}]+)\}', block):
        body = obj_match.group(1)
        term_m = re.search(r'"?term"?\s*:\s*"?([^,"{}]+)"?', body, re.IGNORECASE)
        def_m = re.search(r'"?definition"?\s*:\s*"?([^,"{}]+(?:,[^,"{}]+)*)"?', body, re.IGNORECASE)
        term = term_m.group(1).strip().strip('"') if term_m else ""
        defn = def_m.group(1).strip().strip('"') if def_m else ""
        if term and defn:
            defs.append({"term": term, "definition": defn})
    return defs


def _normalize_analysis_result(result: dict, analysis_type: str) -> dict:
    """Normalize LLM output into the expected schema.

    Handles:
    1. Proper JSON already parsed into a dict
    2. JSON text embedded in the summary field
    3. Plain-text format with unquoted section headers
    """
    if not isinstance(result, dict):
        result = {}

    summary = result.get("summary")

    # Case 1: summary field contains a full JSON object — re-parse it
    if isinstance(summary, str):
        raw = summary.strip()
        if raw.startswith("{"):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    result = parsed
            except Exception:
                pass

    # Case 2: summary contains plain-text structured data (no JSON)
    # Re-check after potential re-parse above
    summary2 = result.get("summary", "")
    doc_sections_missing = not any(result.get(k) for k in ["important_points", "key_points", "key_definitions", "study_tips", "follow_up_questions"])

    if isinstance(summary2, str) and doc_sections_missing:
        plain = _extract_plain_text_sections(summary2)
        if plain:
            # Merge: plain sections override empty defaults
            for k, v in plain.items():
                if k == "summary":
                    result["summary"] = v
                elif not result.get(k):  # only fill if not already present
                    result[k] = v

    # Ensure all expected keys exist
    if analysis_type == "video":
        result.setdefault("summary", "")
        result["key_points"] = result.get("key_points") or []
        result["follow_up_questions"] = result.get("follow_up_questions") or []
    else:
        result.setdefault("summary", "")
        result["important_points"] = result.get("important_points") or []
        result["key_definitions"] = result.get("key_definitions") or []
        result["study_tips"] = result.get("study_tips") or []

    return result


# =========================================================================
# GET  saved analysis / flashcards for a resource
# =========================================================================

@ai_bp.get("/resource/<int:resource_id>/analysis")
@role_required("student")
def get_saved_analysis(resource_id: int):
    """Return the most recent saved analysis for a resource (if any)."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    resource, _ = _authorize_resource(student, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    analysis = (
        AIAnalysis.query
        .filter_by(resource_id=resource_id, user_id=student.id)
        .order_by(AIAnalysis.updated_at.desc())
        .first()
    )

    if not analysis:
        return success_response("OK", None)

    normalized = _normalize_analysis_result(
        analysis.to_dict(),
        analysis.analysis_type,
    )
    return success_response("OK", normalized)


@ai_bp.get("/resource/<int:resource_id>/flashcards")
@role_required("student")
def get_saved_flashcards(resource_id: int):
    """Return all saved flashcards for a resource."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    resource, _ = _authorize_resource(student, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    cards = (
        AIFlashcard.query
        .filter_by(resource_id=resource_id, user_id=student.id)
        .order_by(AIFlashcard.id)
        .all()
    )

    return success_response("OK", {
        "flashcards": [c.to_dict() for c in cards],
    })


# =========================================================================
# POST  analyze video
# =========================================================================

@ai_bp.post("/analyze-video")
@role_required("student")
@limiter.limit("20/hour")
def analyze_video():
    """Analyze a video resource — summary, key points, follow-ups. Persisted in DB."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    payload = request.get_json(silent=True) or {}
    resource_id = payload.get("resource_id")
    video_url = payload.get("video_url", "")
    video_title = payload.get("title", "")

    try:
        resource = None
        if resource_id:
            resource, course = _authorize_resource(student, resource_id)
            if not resource:
                return error_response("Resource not found or unauthorized", 404)
            video_url = resource.url_or_path
            video_title = video_title or resource.title

        if not video_url and not video_title:
            return error_response("video_url or resource_id is required", 400)

        result = None
        source = "title_context"

        # Try transcription for local files
        if _is_local_file(video_url):
            upload_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
            file_path = Path(upload_dir) / video_url.replace("uploads/", "")
            if file_path.exists() and file_path.suffix.lower() in VIDEO_EXTENSIONS:
                try:
                    transcript = transcribe_audio(str(file_path))
                    if transcript and len(transcript) > 50:
                        result = analyze_video_content(transcript, video_title)
                        source = "transcription"
                except Exception:
                    pass

        if result is None:
            result = summarize_video_from_url(video_url, video_title)

        result = _normalize_analysis_result(result, "video")

        result["source"] = source

        # ── persist ──────────────────────────────────────────────────
        if resource:
            existing = AIAnalysis.query.filter_by(
                resource_id=resource.id, user_id=student.id, analysis_type="video"
            ).first()
            if existing:
                existing.summary = result.get("summary", "")
                existing.source = source
                existing.data = result
                existing.updated_at = datetime.utcnow()
            else:
                existing = AIAnalysis(
                    resource_id=resource.id,
                    user_id=student.id,
                    analysis_type="video",
                    source=source,
                    summary=result.get("summary", ""),
                )
                existing.data = result
                db.session.add(existing)
            db.session.commit()
            result["id"] = existing.id

        return success_response("Video analyzed successfully", result)

    except Exception as e:
        db.session.rollback()
        return error_response(f"AI analysis failed: {str(e)}", 500)


# ---------------------------------------------------------------------------
# Document Analysis
# ---------------------------------------------------------------------------

@ai_bp.post("/analyze-document")
@role_required("student")
@limiter.limit("20/hour")
def analyze_doc():
    """Analyze a document resource — important points, definitions, tips. Persisted in DB."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    payload = request.get_json(silent=True) or {}
    resource_id = payload.get("resource_id")
    doc_url = payload.get("doc_url", "")
    doc_title = payload.get("title", "")
    doc_text = payload.get("text_content", "")

    try:
        resource = None
        if resource_id:
            resource, course = _authorize_resource(student, resource_id)
            if not resource:
                return error_response("Resource not found or unauthorized", 404)
            doc_url = resource.url_or_path
            doc_title = doc_title or resource.title

        if not doc_url and not doc_title and not doc_text:
            return error_response("doc_url, resource_id, or text_content is required", 400)

        # Try to read local file content
        if not doc_text and _is_local_file(doc_url):
            upload_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
            file_path = Path(upload_dir) / doc_url.replace("uploads/", "")
            if file_path.exists():
                doc_text = read_text_file(str(file_path))

        if doc_text and len(doc_text.strip()) > 20:
            result = analyze_document(doc_text, doc_title)
            source = "full_text"
        else:
            result = analyze_document_from_url(doc_url, doc_title)
            source = "title_context"

        result = _normalize_analysis_result(result, "document")

        result["source"] = source

        # ── persist ──────────────────────────────────────────────────
        if resource:
            existing = AIAnalysis.query.filter_by(
                resource_id=resource.id, user_id=student.id, analysis_type="document"
            ).first()
            if existing:
                existing.summary = result.get("summary", "")
                existing.source = source
                existing.data = result
                existing.updated_at = datetime.utcnow()
            else:
                existing = AIAnalysis(
                    resource_id=resource.id,
                    user_id=student.id,
                    analysis_type="document",
                    source=source,
                    summary=result.get("summary", ""),
                )
                existing.data = result
                db.session.add(existing)
            db.session.commit()
            result["id"] = existing.id

        return success_response("Document analyzed successfully", result)

    except Exception as e:
        db.session.rollback()
        return error_response(f"AI analysis failed: {str(e)}", 500)


# ---------------------------------------------------------------------------
# Chatbot  (with persisted history)
# ---------------------------------------------------------------------------

@ai_bp.post("/chat")
@role_required("student")
@limiter.limit("60/hour")
def ai_chat():
    """AI chatbot — general or course-specific. Persists chat history."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages", [])
    course_id = payload.get("course_id")
    chat_id = payload.get("chat_id")

    if not messages:
        return error_response("messages array is required", 400)

    for msg in messages:
        if not isinstance(msg, dict) or "role" not in msg or "content" not in msg:
            return error_response("Each message must have role and content", 400)

    try:
        course_context = None
        if course_id:
            course = Course.query.get(course_id)
            if course and course.department_id == student.department_id:
                course_data = {
                    "name": course.name,
                    "description": course.description,
                    "teacher": {"name": course.teacher.name if course.teacher else "Unknown"},
                    "resources": [],
                }
                for r in course.resources.all():
                    res_data = {"title": r.title, "type": r.type, "notes": r.notes}
                    if _is_local_file(r.url_or_path):
                        upload_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
                        file_path = Path(upload_dir) / r.url_or_path.replace("uploads/", "")
                        if file_path.exists():
                            text = read_text_file(str(file_path))
                            if text:
                                res_data["content_preview"] = text[:2000]
                    course_data["resources"].append(res_data)

                course_context = build_course_context(course_data)
                for r in course_data["resources"]:
                    if r.get("content_preview"):
                        course_context += f"\n\nResource '{r['title']}' content:\n{r['content_preview']}"

        reply = chat_with_ai(messages, course_context=course_context)

        # ── persist chat history ─────────────────────────────────────
        all_msgs = messages + [{"role": "assistant", "content": reply}]
        if chat_id:
            chat_record = AIChatHistory.query.filter_by(
                id=chat_id, user_id=student.id
            ).first()
            if chat_record:
                chat_record.messages = all_msgs
                chat_record.updated_at = datetime.utcnow()
        else:
            title_text = messages[-1]["content"][:80] if messages else "New chat"
            chat_record = AIChatHistory(
                user_id=student.id,
                course_id=int(course_id) if course_id else None,
                title=title_text,
            )
            chat_record.messages = all_msgs
            db.session.add(chat_record)

        db.session.commit()

        return success_response("AI response", {
            "reply": reply,
            "chat_id": chat_record.id if chat_record else None,
        })

    except Exception as e:
        db.session.rollback()
        return error_response(f"AI chat failed: {str(e)}", 500)


# ── Chat history endpoints ───────────────────────────────────────────────

@ai_bp.get("/chats")
@role_required("student")
def get_chat_list():
    """List student's chat sessions."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)
    course_id = request.args.get("course_id", type=int)
    q = AIChatHistory.query.filter_by(user_id=student.id)
    if course_id:
        q = q.filter_by(course_id=course_id)
    chats = q.order_by(AIChatHistory.updated_at.desc()).limit(50).all()
    return success_response("Chat list", [c.to_dict() for c in chats])


@ai_bp.get("/chats/<int:chat_id>")
@role_required("student")
def get_chat_session(chat_id):
    """Return a single chat session with full messages."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)
    chat = AIChatHistory.query.filter_by(id=chat_id, user_id=student.id).first()
    if not chat:
        return error_response("Chat not found", 404)
    return success_response("Chat session", chat.to_dict())


@ai_bp.delete("/chats/<int:chat_id>")
@role_required("student")
def delete_chat_session(chat_id):
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)
    chat = AIChatHistory.query.filter_by(id=chat_id, user_id=student.id).first()
    if not chat:
        return error_response("Chat not found", 404)
    db.session.delete(chat)
    db.session.commit()
    return success_response("Chat deleted")


# ---------------------------------------------------------------------------
# Quick Explain  (highlight text → explain)
# ---------------------------------------------------------------------------

@ai_bp.post("/explain")
@role_required("student")
@limiter.limit("40/hour")
def ai_explain():
    """Quick explain — student highlights text and asks AI to explain."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    context = (payload.get("context") or "").strip()

    if not text:
        return error_response("text is required", 400)

    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a helpful educational assistant. A student has highlighted some text "
                    "and wants you to explain it clearly. Be concise, use simple language, and "
                    "provide examples where helpful. Format with markdown."
                ),
            },
            {
                "role": "user",
                "content": f"Please explain this:\n\n\"{text}\""
                + (f"\n\nContext: {context}" if context else ""),
            },
        ]

        reply = chat_with_ai(messages)
        return success_response("Explanation generated", {"explanation": reply})

    except Exception as e:
        return error_response(f"AI explain failed: {str(e)}", 500)


# ---------------------------------------------------------------------------
# Analysis Translation
# ---------------------------------------------------------------------------

@ai_bp.post("/translate-analysis")
@role_required("student")
@limiter.limit("120/hour")
def translate_analysis_payload():
    """Translate existing analysis payload into a target language."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    payload = request.get_json(silent=True) or {}
    analysis = payload.get("analysis")
    analysis_type = (payload.get("analysis_type") or "").strip().lower()
    target_language = (payload.get("target_language") or "").strip().lower()

    if not isinstance(analysis, dict):
        return error_response("analysis object is required", 400)
    if analysis_type not in ("video", "document"):
        return error_response("analysis_type must be 'video' or 'document'", 400)
    if not target_language:
        return error_response("target_language is required", 400)

    valid_lang_values = set(SUPPORTED_TRANSLATION_LANGS.values())
    if target_language not in SUPPORTED_TRANSLATION_LANGS and target_language not in valid_lang_values:
        return error_response("Unsupported target language", 400)

    try:
        translated = translate_analysis(analysis, analysis_type, target_language)
        return success_response("Analysis translated successfully", translated)
    except Exception as e:
        return error_response(f"Translation failed: {str(e)}", 500)


@ai_bp.post("/translate-flashcards")
@role_required("student")
@limiter.limit("120/hour")
def translate_flashcards_payload():
    """Translate flashcard front/back pairs into a target language."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    payload = request.get_json(silent=True) or {}
    cards = payload.get("flashcards")
    target_language = (payload.get("target_language") or "").strip().lower()

    if not isinstance(cards, list) or not cards:
        return error_response("flashcards array is required", 400)
    if not target_language:
        return error_response("target_language is required", 400)

    valid_lang_values = set(SUPPORTED_TRANSLATION_LANGS.values())
    if target_language not in SUPPORTED_TRANSLATION_LANGS and target_language not in valid_lang_values:
        return error_response("Unsupported target language", 400)

    try:
        translated = translate_flashcards(cards, target_language)
        return success_response("Flashcards translated successfully", {"flashcards": translated})
    except Exception as e:
        return error_response(f"Translation failed: {str(e)}", 500)


# ---------------------------------------------------------------------------
# Flashcards  (persisted per-resource)
# ---------------------------------------------------------------------------

@ai_bp.post("/flashcards")
@role_required("student")
@limiter.limit("15/hour")
def ai_flashcards():
    """Generate flashcards from a resource and persist them."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    payload = request.get_json(silent=True) or {}
    resource_id = payload.get("resource_id")
    text_content = payload.get("text_content", "")
    title = payload.get("title", "")

    try:
        resource = None
        if resource_id:
            resource, course = _authorize_resource(student, resource_id)
            if not resource:
                return error_response("Resource not found or unauthorized", 404)
            title = title or resource.title

            if _is_local_file(resource.url_or_path):
                upload_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
                file_path = Path(upload_dir) / resource.url_or_path.replace("uploads/", "")
                if file_path.exists():
                    text_content = read_text_file(str(file_path))

        if not text_content and not title:
            return error_response("resource_id, text_content, or title is required", 400)

        system = (
            "You are an expert educational AI. Generate study flashcards from the given content. "
            "Return ONLY valid JSON with a key \"flashcards\" containing an array of objects, "
            "each with \"front\" (question), \"back\" (answer), and \"category\" "
            "(e.g. Definition, Concept, Formula, Example, Application) keys. "
            "Generate 8-12 flashcards covering the most important concepts. "
            "Do NOT include markdown code fences."
        )
        user_msg = (
            f"Title: {title}\n\nContent:\n{text_content[:10000]}"
            if text_content
            else f"Title: {title}"
        )

        from ..services.ai_service import _chat, _parse_json

        raw = _chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            temperature=0.3,
        )
        parsed = _parse_json(raw, fallback={"flashcards": []})
        cards = parsed.get("flashcards", [])

        # ── persist flashcards ───────────────────────────────────────
        saved = []
        if resource:
            # Remove old flashcards for this user+resource
            AIFlashcard.query.filter_by(
                resource_id=resource.id, user_id=student.id
            ).delete()

            for idx, card in enumerate(cards):
                fc = AIFlashcard(
                    resource_id=resource.id,
                    user_id=student.id,
                    front=card.get("front", ""),
                    back=card.get("back", ""),
                    category=card.get("category", "General"),
                    order=idx,
                )
                db.session.add(fc)
                saved.append(fc)
            db.session.commit()
            cards = [fc.to_dict() for fc in saved]

        return success_response("Flashcards generated", {"flashcards": cards})

    except Exception as e:
        db.session.rollback()
        return error_response(f"Flashcard generation failed: {str(e)}", 500)


# ── Flashcard management endpoints ───────────────────────────────────────

@ai_bp.put("/flashcards/<int:fc_id>/review")
@role_required("student")
def review_flashcard(fc_id):
    """Update a flashcard after review (difficulty, times_reviewed)."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)
    fc = AIFlashcard.query.filter_by(id=fc_id, user_id=student.id).first()
    if not fc:
        return error_response("Flashcard not found", 404)

    payload = request.get_json(silent=True) or {}
    difficulty = payload.get("difficulty")
    if difficulty in ("easy", "medium", "hard"):
        fc.difficulty = difficulty
    fc.times_reviewed = (fc.times_reviewed or 0) + 1
    fc.last_reviewed_at = datetime.utcnow()
    db.session.commit()
    return success_response("Flashcard updated", fc.to_dict())


@ai_bp.delete("/flashcards/<int:fc_id>")
@role_required("student")
def delete_flashcard(fc_id):
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)
    fc = AIFlashcard.query.filter_by(id=fc_id, user_id=student.id).first()
    if not fc:
        return error_response("Flashcard not found", 404)
    db.session.delete(fc)
    db.session.commit()
    return success_response("Flashcard deleted")


# ---------------------------------------------------------------------------
# Text-to-Speech (gTTS) — Indian language audio generation
# ---------------------------------------------------------------------------

@ai_bp.post("/tts")
@role_required("student")
def text_to_speech():
    """Generate MP3 audio for the given text using gTTS.

    Accepts JSON  { text: str, language: str }  where language is an
    ISO 639-1 code  (hi, te, ta, kn, ml, mr, bn, gu, pa, ur, en …).
    Returns the raw MP3 bytes with Content-Type audio/mpeg.
    """
    from io import BytesIO
    try:
        from gtts import gTTS
    except ImportError:
        return error_response("gTTS library not installed on server", 500)

    data = request.get_json(force=True) or {}
    text = (data.get("text") or "").strip()
    language = (data.get("language") or "en").strip().lower()

    if not text:
        return error_response("text is required", 400)

    # Cap length to avoid very slow responses
    text = text[:6000]

    try:
        tts = gTTS(text=text, lang=language, slow=False)
        buf = BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return Response(
            buf.read(),
            mimetype="audio/mpeg",
            headers={"Cache-Control": "no-store"},
        )
    except Exception as exc:
        current_app.logger.error("gTTS error: %s", exc)
        return error_response(f"Speech generation failed: {exc}", 500)
