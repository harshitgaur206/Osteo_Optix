import bcrypt
import jwt
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import get_db
from .models import HealthWorker

logger = logging.getLogger(__name__)

# JWT signing key MUST come from the environment in any real deployment — a
# key baked into the source (and therefore into every client bundle / git
# history) lets anyone mint valid worker tokens. If JWT_SECRET_KEY isn't set
# we fall back to a random key generated at process startup: this keeps the
# hackathon demo working out of the box while making it obvious (tokens
# stop validating on restart, and a loud warning is logged) that this is not
# a production configuration.
SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(48)
    logger.warning(
        "JWT_SECRET_KEY not set — using a randomly generated key for this "
        "process only (all existing tokens will be invalidated on restart). "
        "Set JWT_SECRET_KEY to a strong, persistent secret before deploying "
        "with real patient data."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=False)

def hash_pin(pin: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pin.encode('utf-8'), salt).decode('utf-8')

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    try:
        return bcrypt.checkpw(plain_pin.encode('utf-8'), hashed_pin.encode('utf-8'))
    except Exception as e:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception:
        return None

def get_current_worker(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[HealthWorker]:
    if not credentials:
        return None
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "worker_id" not in payload:
        return None
    worker_id = payload["worker_id"]
    worker = db.query(HealthWorker).filter(HealthWorker.worker_id == worker_id, HealthWorker.is_active == True).first()
    return worker
