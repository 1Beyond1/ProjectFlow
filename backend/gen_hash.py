import getpass
import sys

try:
    import bcrypt
except ImportError:
    print("Error: 'bcrypt' module not found.")
    print("Please check your python environment or run: pip install bcrypt")
    sys.exit(1)


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("Password exceeds bcrypt's 72-byte limit.")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


if __name__ == "__main__":
    try:
        pwd = getpass.getpass("Enter new password: ")
        confirm = getpass.getpass("Confirm new password: ")
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled.")
        sys.exit(1)

    if not pwd:
        print("Error: Password cannot be empty.")
        sys.exit(1)

    if pwd != confirm:
        print("Error: Passwords do not match.")
        sys.exit(1)

    try:
        hashed = hash_password(pwd)
    except ValueError as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    print(f"\nHash: {hashed}")
    print("\n[Action] Please copy the Hash string above and update the 'password_hash' column in your database.")
