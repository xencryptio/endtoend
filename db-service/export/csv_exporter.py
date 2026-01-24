import csv
import io
import logging
import os
from typing import List, Dict, Any
from datetime import datetime
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

log = logging.getLogger(__name__)

class DatabaseCSVExporter:
    """Export database tables to CSV format"""
    
    def __init__(self):
        # Fix spaces in URLs
        self.databases = {
            'scandb': os.getenv("DATABASE_URL", "postgresql://scanuser:scanpass@postgres:5432/scandb"),
            'repo_scanner_db': os.getenv("REPO_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/repo_scanner_db"),
            'system_scanner_db': os.getenv("SYSTEM_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db")
        }
        self.engines = {}
        self.sessions = {}
        
        # Initialize connections
        for db_name, db_url in self.databases.items():
            try:
                engine = create_engine(db_url, pool_pre_ping=True)
                self.engines[db_name] = engine
                self.sessions[db_name] = sessionmaker(bind=engine)
                log.info(f"✅ Connected to {db_name}")
            except Exception as e:
                log.error(f"❌ Failed to connect to {db_name}: {e}")
    
    def get_table_names(self, db_name: str) -> List[str]:
        """Get all table names from a database"""
        try:
            engine = self.engines.get(db_name)
            if not engine:
                return []
            
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            log.info(f"Found {len(tables)} tables in {db_name}")
            return tables
        except Exception as e:
            log.error(f"Error getting tables from {db_name}: {e}")
            return []
    
    def get_table_data(self, db_name: str, table_name: str) -> List[Dict[str, Any]]:
        """Fetch all data from a table"""
        try:
            # Validate table name against whitelist
            valid_tables = self.get_table_names(db_name)
            if table_name not in valid_tables:
                log.error(f"❌ Invalid table name request: {table_name}")
                return []

            session_maker = self.sessions.get(db_name)
            if not session_maker:
                return []
            
            session = session_maker()
            try:
                # Use text() for raw SQL queries - table name is now validated
                query = text(f"SELECT * FROM {table_name}")
                result = session.execute(query)
                
                # Get column names
                columns = result.keys()
                
                # Fetch all rows
                rows = result.fetchall()
                
                # Convert to list of dicts
                data = []
                for row in rows:
                    row_dict = {}
                    for i, col in enumerate(columns):
                        value = row[i]
                        # Convert datetime objects to ISO format
                        if isinstance(value, datetime):
                            value = value.isoformat()
                        # Convert None to empty string for CSV
                        elif value is None:
                            value = ''
                        # Convert dict/list to string
                        elif isinstance(value, (dict, list)):
                            value = str(value)
                        row_dict[col] = value
                    data.append(row_dict)
                
                log.info(f"✅ Exported {len(data)} rows from {db_name}.{table_name}")
                return data
            finally:
                session.close()
        except Exception as e:
            log.error(f"❌ Error exporting {db_name}.{table_name}: {e}")
            return []
    
    def export_table_to_csv(self, db_name: str, table_name: str) -> str:
        """Export a single table to CSV string"""
        data = self.get_table_data(db_name, table_name)
        
        if not data:
            return ""
        
        # Create CSV in memory
        output = io.StringIO()
        
        # Get column names from first row
        fieldnames = list(data[0].keys())
        
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
        
        csv_content = output.getvalue()
        output.close()
        
        return csv_content
    
    def export_all_tables(self) -> Dict[str, Dict[str, str]]:
        """
        Export all tables from all databases
        Returns: {
            'scandb': {'table1': 'csv_content', 'table2': 'csv_content'},
            'repo_scanner_db': {...},
            'system_scanner_db': {...}
        }
        """
        all_exports = {}
        
        for db_name in self.databases.keys():
            log.info(f"📦 Exporting database: {db_name}")
            db_exports = {}
            
            tables = self.get_table_names(db_name)
            
            for table_name in tables:
                csv_content = self.export_table_to_csv(db_name, table_name)
                if csv_content:
                    db_exports[table_name] = csv_content
            
            all_exports[db_name] = db_exports
            log.info(f"✅ Exported {len(db_exports)} tables from {db_name}")
        
        return all_exports
    
    def get_export_summary(self) -> Dict[str, Any]:
        """Get summary of what will be exported"""
        summary = {
            "timestamp": datetime.now().isoformat(),
            "databases": {}
        }
        
        for db_name in self.databases.keys():
            tables = self.get_table_names(db_name)
            table_info = {}
            
            for table_name in tables:
                data = self.get_table_data(db_name, table_name)
                table_info[table_name] = {
                    "row_count": len(data),
                    "columns": list(data[0].keys()) if data else []
                }
            
            summary["databases"][db_name] = {
                "table_count": len(tables),
                "tables": table_info
            }
        
        return summary
    
    def get_complete_export_with_summary(self) -> Dict[str, Any]:
        """
        Get complete export with both summary and actual data
        Returns: {
            "summary": {...},
            "data": {
                "scandb": {
                    "organizations": [
                        {"id": "...", "name": "..."},
                        ...
                    ]
                }
            }
        }
        """
        result = {
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "databases": {}
            },
            "data": {}
        }
        
        for db_name in self.databases.keys():
            log.info(f"📦 Exporting complete data from: {db_name}")
            
            tables = self.get_table_names(db_name)
            
            # Initialize database sections
            result["summary"]["databases"][db_name] = {
                "table_count": len(tables),
                "tables": {}
            }
            result["data"][db_name] = {}
            
            total_rows = 0
            
            for table_name in tables:
                # Get actual data
                table_data = self.get_table_data(db_name, table_name)
                
                # Add to summary
                result["summary"]["databases"][db_name]["tables"][table_name] = {
                    "row_count": len(table_data),
                    "columns": list(table_data[0].keys()) if table_data else [],
                    "has_data": len(table_data) > 0
                }
                
                # Add actual data
                result["data"][db_name][table_name] = table_data
                
                total_rows += len(table_data)
                
                log.info(f"  ✅ {table_name}: {len(table_data)} rows")
            
            # Add totals to summary
            result["summary"]["databases"][db_name]["total_rows"] = total_rows
            
            log.info(f"✅ Completed {db_name}: {len(tables)} tables, {total_rows} total rows")
        
        # Add overall totals
        result["summary"]["total_databases"] = len(self.databases)
        result["summary"]["total_tables"] = sum(
            db_info["table_count"] 
            for db_info in result["summary"]["databases"].values()
        )
        result["summary"]["total_rows"] = sum(
            db_info["total_rows"] 
            for db_info in result["summary"]["databases"].values()
        )
        
        return result

# Singleton instance
dashboarder = DatabaseCSVExporter()
