def normalize_repo_url(url: str) -> str:
    """Normalize repository URL for matching"""
    if not url:
        return ""
    url = url.lower().strip()
    url = url.rstrip('/')
    url = url.replace('.git', '')
    return url
