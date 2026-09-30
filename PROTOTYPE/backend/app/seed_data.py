from sqlalchemy.orm import Session

from .database import SessionLocal, Base, engine
from .models import HealthWorker
from .auth import hash_pin

DEMO_HEALTH_WORKERS = [
    {
        "worker_id": "HW_NER_01",
        "name": "Animesh Borah",
        "pin": "1234",
        "assigned_camp": "Guwahati Community Camp",
        "assigned_district": "Kamrup Metropolitan",
        "is_active": True,
    },
    {
        "worker_id": "HW_NER_02",
        "name": "Priya Sharma",
        "pin": "5678",
        "assigned_camp": "Dibrugarh Rural Health Center",
        "assigned_district": "Dibrugarh",
        "is_active": True,
    },
    {
        "worker_id": "HW_NER_03",
        "name": "Ramesh Das",
        "pin": "9999",
        "assigned_camp": "Silchar Primary Care Camp",
        "assigned_district": "Cachar",
        "is_active": True,
    },
]


def _upsert_demo_health_workers(db: Session) -> None:
    """Ensure demo workers exist with bcrypt pin hashes (fixes legacy plaintext seeds)."""
    for spec in DEMO_HEALTH_WORKERS:
        pin_hash = hash_pin(spec["pin"])
        fields = {k: v for k, v in spec.items() if k != "pin"}
        existing = (
            db.query(HealthWorker)
            .filter(HealthWorker.worker_id == spec["worker_id"])
            .first()
        )
        if existing:
            for key, value in fields.items():
                setattr(existing, key, value)
            existing.pin_hash = pin_hash
        else:
            db.add(HealthWorker(**fields, pin_hash=pin_hash))
    db.commit()
    print("Demo Health Workers synced (PIN hashes updated).")


def seed_database():
    """Seed only what the deployed system legitimately needs pre-loaded:
    the registered Health Worker accounts (Item: 'workers data' — the sole
    exception to the no-hardcoded-data rule). No demo patients or demo
    screenings are seeded — every User and Screening record in the database
    from this point on is created only through real app usage (patient
    registration + completed screenings), so the dashboard's summary cards
    and its records table always describe the exact same underlying data.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    _upsert_demo_health_workers(db)
    db.close()

if __name__ == "__main__":
    seed_database()
