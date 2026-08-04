from pathlib import Path
from uuid import uuid4

from flask import Blueprint, current_app, g, request, send_from_directory
from werkzeug.utils import secure_filename

from app.utils.auth import require_business
from app.utils.responses import error, success


bp = Blueprint("uploads", __name__, url_prefix="/api/v1/uploads")
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _upload_folder():
    folder = Path(current_app.config["UPLOAD_FOLDER"])
    folder.mkdir(parents=True, exist_ok=True)
    return folder


@bp.post("/images")
@require_business("manager")
def upload_image():
    image = request.files.get("image")
    if not image or not image.filename:
        return error("Selecciona una imagen para subir.", 400)
    extension = secure_filename(image.filename).rsplit(".", 1)[-1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        return error("Usa una imagen JPG, PNG o WebP.", 400)
    image.seek(0, 2)
    size = image.tell()
    image.seek(0)
    if size > MAX_IMAGE_BYTES:
        return error("La imagen no puede pesar más de 5 MB.", 413)
    filename = f"business-{g.current_business.id}-{uuid4().hex}.{extension}"
    image.save(_upload_folder() / filename)
    url = f"{request.host_url.rstrip('/')}/api/v1/uploads/images/{filename}"
    return success({"url": url}, "Imagen subida.", 201)


@bp.get("/images/<path:filename>")
def serve_image(filename):
    return send_from_directory(_upload_folder(), secure_filename(filename), max_age=86400)
