import sys

try:
    from passlib.context import CryptContext
except ImportError:
    print("Error: 'passlib' module not found.")
    print("Please check your python environment or run: pip install passlib bcrypt")
    sys.exit(1)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python gen_hash.py <your_new_password>")
        sys.exit(1)
    
    pwd = sys.argv[1]
    hashed = hash_password(pwd)
    print(f"\nPassword: {pwd}")
    print(f"Hash:     {hashed}")
    print(f"\n[Action] Please copy the Hash string above and update the 'password_hash' column in your flow.db file.")
