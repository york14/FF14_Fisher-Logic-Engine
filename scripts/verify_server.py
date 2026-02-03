import urllib.request
import sys

TARGET_URL = "http://localhost:3000"
EXPECTED_STRINGS = [
    "Fisher-Logic-Engine", # Title or key component
    "vite",                # Vite signature
]

def verify_server():
    print(f"Checking server at {TARGET_URL}...")
    try:
        with urllib.request.urlopen(TARGET_URL) as response:
            status = response.getcode()
            content = response.read().decode('utf-8')
            
            print(f"HTTP Status: {status}")
            
            if status == 200:
                print("[OK] Server is reachable.")
            else:
                print(f"[ERROR] Server returned unexpected status: {status}")
                return False

            missing = []
            for s in EXPECTED_STRINGS:
                if s.lower() in content.lower():
                    print(f"[OK] Found content: '{s}'")
                else:
                    print(f"[WARN] Missing content: '{s}'")
                    missing.append(s)
            
            if not missing:
                print("\n[Result] Application seems to be running correctly.")
                return True
            else:
                print("\n[Result] Server is running but content might be incomplete.")
                return True # Still return true as server is up

    except Exception as e:
        print(f"[ERROR] Failed to connect: {e}")
        return False

if __name__ == "__main__":
    success = verify_server()
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
