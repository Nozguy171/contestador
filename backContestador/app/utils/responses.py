from flask import jsonify


def success(data=None, message="ok", status=200):
    payload = {"message": message}
    if data is not None:
        payload["data"] = data
    return jsonify(payload), status


def error(message="error", status=400, details=None):
    payload = {"message": message}
    if details is not None:
        payload["details"] = details
    return jsonify(payload), status
