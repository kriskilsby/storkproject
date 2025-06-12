from dotenv import load_dotenv
import os
from pathlib import Path

dotenv_path = Path('.') / '.env'  # current directory is backend/
load_dotenv(dotenv_path)

print(f"DB_USER={os.getenv('DB_USER')}")
print(f"DB_PASSWORD={'SET' if os.getenv('DB_PASSWORD') else 'NOT SET'}")
print(f"DB_HOST={os.getenv('DB_HOST')}")
print(f"DB_PORT={os.getenv('DB_PORT')}")
print(f"DB_NAME={os.getenv('DB_NAME')}")
