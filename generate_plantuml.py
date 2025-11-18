# generate_plantuml.py
import ast
import os
from collections import defaultdict

PLANTUML_OUTPUT_FILE = "architecture.puml"

# --- Configuration for Model Files ---
# Map logical database names to their primary model file paths
MODEL_FILES = {
    "scandb": "db-service/models.py",
    "repo_scanner_db": "repo_scanner/app.py",
    "system_scanner_db": "system-scaner/api_server.py",
}

# --- PlantUML Generation Logic ---

def generate_plantuml_header():
    return """@startuml Architecture Diagram
!theme plain

' Define colors for clarity
skinparam class {
    BackgroundColor White
    BorderColor #232F3E
    ArrowColor #232F3E
    FontColor #232F3E
}
skinparam component {
    BackgroundColor #FF9900
    BorderColor #232F3E
    FontColor #232F3E
}
skinparam database {
    BackgroundColor #0073BB
    BorderColor #232F3E
    FontColor White
}
skinparam package {
    BackgroundColor #E0E0E0
    BorderColor #232F3E
    FontColor #232F3E
}

title End-to-End Project Architecture Overview

' Define Services as Components
component "Frontend (Web UI)" as Frontend #LightBlue
component "db-service (FastAPI)" as DBService #LightGreen
component "repo_scanner (FastAPI)" as RepoScanner #LightGreen
component "system-scaner (FastAPI)" as SystemScaner #LightGreen
component "scan-service (FastAPI)" as ScanService #LightGreen
component "System Agent (Linux/Windows)" as SystemAgent #LightCoral

database "PostgreSQL Instance" as PostgresDB {
"""

def generate_plantuml_footer():
    return """

} ' End of PostgreSQL Instance

' Define service interactions
Frontend --> DBService : "API Calls (URL Scans)"
Frontend --> RepoScanner : "API Calls (Repo Scans)"
Frontend --> SystemScaner : "API Calls (Agent Mgmt)"

DBService --> Scandb : "SQLAlchemy (scandb)"
RepoScanner --> RepoScannerDb : "SQLAlchemy (repo_scanner_db)"
SystemScaner --> SystemScannerDb : "SQLAlchemy (system_scanner_db)"

ScanService .right.> DBService : "HTTP API Calls (Store Results)"
SystemAgent .up.> SystemScaner : "HTTP API Calls (Register, Heartbeat, Tasks, Results)"

@enduml
"""

def parse_model_file(file_path, base_class_name="Base"):
    """Parses a Python file to extract SQLAlchemy model definitions."""
    models = {}
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read(), filename=file_path)

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # Check if it inherits from the SQLAlchemy Base
                inherits_base = False
                for base in node.bases:
                    if isinstance(base, ast.Name) and base.id == base_class_name:
                        inherits_base = True
                        break
                if not inherits_base:
                    continue

                model_name = node.name
                table_name = None
                columns = []
                relationships = []
                
                # Find __tablename__
                for item in node.body:
                    if isinstance(item, ast.Assign):
                        if len(item.targets) == 1 and isinstance(item.targets[0], ast.Name) and item.targets[0].id == "__tablename__":
                            if isinstance(item.value, ast.Constant):
                                table_name = item.value.value
                            elif isinstance(item.value, ast.Str): # For Python < 3.8
                                table_name = item.value.s
                
                if not table_name: # Fallback if __tablename__ not found or not a simple assignment
                    table_name = model_name.lower() + "s" # Simple pluralization

                for item in node.body:
                    if isinstance(item, ast.Assign):
                        for target in item.targets:
                            if isinstance(target, ast.Name):
                                col_name = target.id
                                col_type = "Unknown"
                                is_pk = False
                                is_fk = False
                                fk_target_table = None

                                if isinstance(item.value, ast.Call) and isinstance(item.value.func, ast.Name) and item.value.func.id == "Column":
                                    for arg in item.value.args:
                                        if isinstance(arg, ast.Name):
                                            col_type = arg.id
                                        elif isinstance(arg, ast.Call) and isinstance(arg.func, ast.Name) and arg.func.id == "ForeignKey":
                                            is_fk = True
                                            if isinstance(arg.args[0], ast.Constant):
                                                fk_target_table = arg.args[0].value.split('.')[0] # e.g., "scan_batches.batch_id" -> "scan_batches"
                                            elif isinstance(arg.args[0], ast.Str): # For Python < 3.8
                                                fk_target_table = arg.args[0].s.split('.')[0]
                                    
                                    for keyword in item.value.keywords:
                                        if keyword.arg == "primary_key" and isinstance(keyword.value, (ast.Constant, ast.Name)) and (keyword.value.value is True or keyword.value.id == "True"):
                                            is_pk = True
                                        if keyword.arg == "unique" and isinstance(keyword.value, (ast.Constant, ast.Name)) and (keyword.value.value is True or keyword.value.id == "True"):
                                            if is_pk: # PK implies unique, no need to mark again
                                                pass
                                            else:
                                                col_name += " (Unique)"
                                        if keyword.arg == "nullable" and isinstance(keyword.value, (ast.Constant, ast.Name)) and (keyword.value.value is False or keyword.value.id == "False"):
                                            col_name += " (NN)" # Not Null
                                        
                                columns.append({
                                    "name": col_name,
                                    "type": col_type,
                                    "is_pk": is_pk,
                                    "is_fk": is_fk,
                                    "fk_target_table": fk_target_table
                                })
                                
                    elif isinstance(item, ast.Expr) and isinstance(item.value, ast.Call) and isinstance(item.value.func, ast.Name) and item.value.func.id == "relationship":
                        # Extract relationship target
                        if item.value.args and isinstance(item.value.args[0], (ast.Constant, ast.Str)):
                            target_model = item.value.args[0].value if isinstance(item.value.args[0], ast.Constant) else item.value.args[0].s
                            relationships.append(target_model)

                models[table_name] = {
                    "model_name": model_name,
                    "columns": columns,
                    "relationships": relationships
                }
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
    return models

def generate_plantuml_for_database(db_name, models):
    """Generates PlantUML for a single logical database."""
    plantuml_str = f'    package "{db_name}" as {db_name.replace("-", "_").capitalize()} {{\n'
    for table_name, details in models.items():
        plantuml_str += f'        class "{details["model_name"]}" as {details["model_name"]} {{\n'
        pk_section = []
        other_section = []
        for col in details["columns"]:
            col_line = f'            {col["name"]}: {col["type"]}'
            if col["is_pk"]:
                pk_section.append(f'            + PK {col["name"]}: {col["type"]}')
            else:
                if col["is_fk"]:
                    other_section.append(f'            + FK {col["name"]}: {col["type"]}')
                else:
                    other_section.append(col_line)
        
        if pk_section:
            plantuml_str += "\n".join(pk_section) + "\n"
            if other_section:
                plantuml_str += "            --\n"
        plantuml_str += "\n".join(other_section) + "\n"
        plantuml_str += '        }\n\n'
    plantuml_str += '    }\n\n'
    return plantuml_str

def generate_plantuml_relationships(all_models):
    """Generates PlantUML relationship lines."""
    plantuml_str = ""
    # Collect all table names for easy lookup
    all_table_names = {}
    for db_name, models in all_models.items():
        for table_name, details in models.items():
            all_table_names[table_name] = (db_name, details["model_name"])

    for db_name, models in all_models.items():
        for table_name, details in models.items():
            current_model_name = details["model_name"]
            
            # Foreign Key relationships
            for col in details["columns"]:
                if col["is_fk"] and col["fk_target_table"]:
                    target_table_name = col["fk_target_table"]
                    if target_table_name in all_table_names:
                        target_db, target_model_name = all_table_names[target_table_name]
                        # Assuming 1-to-many from target to current
                        plantuml_str += f'{target_model_name} "1" -- "*" {current_model_name} : "{col["name"]}"\n'
            
            # SQLAlchemy relationship() definitions
            for related_model_name in details["relationships"]:
                # Try to find the actual table name for the related model
                found_target_table = None
                for other_db_name, other_models in all_models.items():
                    for other_table_name, other_details in other_models.items():
                        if other_details["model_name"] == related_model_name:
                            found_target_table = other_details["model_name"]
                            break
                    if found_target_table:
                        break
                
                if found_target_table:
                    # This is a bit simplistic, assuming 1-to-many from current to related
                    # More complex relationship types (many-to-many, one-to-one) would require deeper AST analysis
                    # For now, we'll represent it as a general association
                    plantuml_str += f'{current_model_name} "1" -- "*" {found_target_table} : "has {related_model_name}"\n'
    
    return plantuml_str

def main():
    all_models = defaultdict(dict)
    for db_name, file_path in MODEL_FILES.items():
        if os.path.exists(file_path):
            print(f"Parsing {file_path} for {db_name} models...")
            models = parse_model_file(file_path)
            all_models[db_name] = models
        else:
            print(f"Warning: Model file not found for {db_name}: {file_path}")

    if not all_models:
        print("No model files found or parsed. Exiting.")
        return

    plantuml_content = []
    plantuml_content.append(generate_plantuml_header())

    for db_name, models in all_models.items():
        plantuml_content.append(generate_plantuml_for_database(db_name, models))
    
    plantuml_content.append("\n' Define relationships between tables\n")
    plantuml_content.append(generate_plantuml_relationships(all_models))

    plantuml_content.append(generate_plantuml_footer())

    with open(PLANTUML_OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("".join(plantuml_content))
    
    print(f"\nPlantUML diagram definition generated successfully to {PLANTUML_OUTPUT_FILE}")
    print("You can now use an online PlantUML renderer or a local tool to convert this file into an image.")

if __name__ == "__main__":
    main()
