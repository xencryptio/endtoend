import requests
from urllib.parse import urlparse

def detect_protocol(url):
    parsed = urlparse(url.strip())

    # If the user provided a scheme like http:// or https://
    if parsed.scheme:
        return parsed.scheme.lower()

    # Otherwise, try to detect it live
    for scheme in ["https", "http"]:
        try:
            response = requests.head(f"{scheme}://{url}", timeout=3)
            if response.status_code < 400:
                return scheme
        except requests.exceptions.RequestException:
            continue

    return "unreachable"

# Example usage
if __name__ == "__main__":
    url = input("Enter URL: ").strip()
    protocol = detect_protocol(url)
    print(f"Protocol detected: {protocol}")
