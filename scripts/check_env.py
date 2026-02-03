import os
try:
    print(f"USERPROFILE: {os.environ.get('USERPROFILE')}")
    print(f"HOME: {os.environ.get('HOME')}")
except Exception as e:
    print(f"Error: {e}")
