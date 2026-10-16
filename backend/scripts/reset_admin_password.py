"""Reset the existing administrator password to admin123.

Run from the repository root:
    python backend/scripts/reset_admin_password.py

Dependencies: pymongo, bcrypt, python-dotenv (included in backend requirements).
Use --env-file backend/.env.workspace to select a different environment.
"""

import argparse
from pathlib import Path
import sys

import bcrypt
from dotenv import dotenv_values
from pymongo import MongoClient
from pymongo.errors import PyMongoError


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(__file__).resolve().parents[1] / ".env")
    args = parser.parse_args()
    if not args.env_file.is_file():
        parser.error("Ficheiro de ambiente nao encontrado.")
    config = dotenv_values(args.env_file)
    if not config.get("MONGO_URL") or not config.get("DB_NAME"):
        parser.error("O ficheiro deve definir MONGO_URL e DB_NAME.")

    email = "admin@whymob.pt"
    password = b"admin123"
    try:
        with MongoClient(config["MONGO_URL"], serverSelectionTimeoutMS=10000, connectTimeoutMS=10000, socketTimeoutMS=10000) as client:
            users = client[config["DB_NAME"]].users
            admin = users.find_one({"email": email, "role": "admin"}, {"_id": 1, "active": 1})
            if not admin:
                print("Administrador existente nao encontrado; nenhuma conta foi alterada.", file=sys.stderr)
                return 1
            hashed = bcrypt.hashpw(password, bcrypt.gensalt()).decode()
            result = users.update_one({"_id": admin["_id"], "role": "admin"}, {"$set": {"password_hash": hashed}})
            if result.matched_count != 1:
                print("Administrador deixou de estar disponivel; reposicao nao confirmada.", file=sys.stderr)
                return 1
            saved = users.find_one({"_id": admin["_id"]}, {"password_hash": 1})
            if not saved or not bcrypt.checkpw(password, saved["password_hash"].encode()):
                print("Nao foi possivel confirmar a nova palavra-passe.", file=sys.stderr)
                return 1
            print(f"Palavra-passe de {email} reposta e verificada na base {config['DB_NAME']}.")
            if not admin.get("active", True):
                print("A conta continua inativa; a reposicao nao altera a ativacao.")
            return 0
    except PyMongoError:
        # Connection errors can contain credentials from the URI: keep them private.
        print("Falha de acesso ao MongoDB. Verifique a ligacao, permissoes e o ficheiro de ambiente.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
