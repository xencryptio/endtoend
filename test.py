import pandas as pd

def create_tls_template():
    tls_data = {
        "domain": [
            "example.com",
            "google.com",
            "github.com"
        ]
    }
    df = pd.DataFrame(tls_data)
    df.to_excel("tls_scan_template.xlsx", index=False)

def create_repo_template():
    repo_data = {
        "repo_url": [
            "https://github.com/user/repo1",
            "https://github.com/user/repo2"
        ],
        "branch_name": [
            "main",
            "develop"
        ]
    }
    df = pd.DataFrame(repo_data)
    df.to_excel("repository_scan_template.xlsx", index=False)

if __name__ == "__main__":
    create_tls_template()
    create_repo_template()
    print("Both Excel templates created successfully!")
