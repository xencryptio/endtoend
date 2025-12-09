import pandas as pd

def create_excel_templates():

    # -----------------------------
    # 1️⃣ TLS Scan Excel Template
    # -----------------------------
    tls_df = pd.DataFrame({
        "domain": [
            "example.com",
            "google.com",
            "github.com"
        ]
    })

    tls_filename = "tls_scan_template.xlsx"
    tls_df.to_excel(tls_filename, index=False)
    print(f"Created: {tls_filename}")

    # -----------------------------------
    # 2️⃣ Repository Scan Excel Template
    # -----------------------------------
    repo_df = pd.DataFrame({
        "repo_url": [
            "https://github.com/user/repo1",
            "https://github.com/user/repo2"
        ],
        "branch_name": [
            "main",
            "develop"
        ]
    })

    repo_filename = "repo_scan_template.xlsx"
    repo_df.to_excel(repo_filename, index=False)
    print(f"Created: {repo_filename}")


if __name__ == "__main__":
    create_excel_templates()
    print("\nAll Excel templates generated successfully!")
