"""Standardized JSON response helpers."""

from flask import jsonify


def success_response(message: str, data=None, status_code: int = 200):
    payload = {
        "success": True,
        "message": message,
        "data": data or {},
    }
    return jsonify(payload), status_code


def error_response(message: str, status_code: int = 400, data=None):
    payload = {
        "success": False,
        "message": message,
        "data": data or {},
    }
    return jsonify(payload), status_code
