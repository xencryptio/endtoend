from datetime import datetime
import io
import zipfile
import logging
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from exceptions import APIError
from .csv_exporter import dashboarder

log = logging.getLogger(__name__)
router = APIRouter(prefix="/export", tags=["export"])


@router.get("/summary")
def get_export_summary():
    """
    Get summary of all tables across all databases.
    Shows table names, row counts, and column names.
    """
    log.info("📊 Generating export summary")
    try:
        summary = dashboarder.get_export_summary()
        return summary
    except Exception as e:
        log.exception("Export summary failed")
        raise APIError(
            status_code=500,
            error_code="export_summary_failed",
            message=f"Failed to generate export summary: {str(e)}"
        )


@router.get("/table/{db_name}/{table_name}")
def export_single_table_csv(db_name: str, table_name: str):
    """
    Export a single table as CSV.
    
    Parameters:
    - db_name: scandb, repo_scanner_db, or system_scanner_db
    - table_name: Name of the table to export
    
    Returns CSV file for download.
    """
    log.info(f"📥 Exporting {db_name}.{table_name}")
    
    # Validate database name
    valid_dbs = ['scandb', 'repo_scanner_db', 'system_scanner_db']
    if db_name not in valid_dbs:
        raise APIError(
            status_code=400,
            error_code="invalid_database",
            message=f"Database must be one of: {', '.join(valid_dbs)}"
        )
    
    try:
        csv_content = dashboarder.export_table_to_csv(db_name, table_name)
        
        if not csv_content:
            raise APIError(
                status_code=404,
                error_code="table_not_found",
                message=f"Table {table_name} not found in {db_name} or has no data"
            )
        
        # Return as downloadable CSV
        return StreamingResponse(
            io.StringIO(csv_content),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={db_name}_{table_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Export failed for {db_name}.{table_name}")
        raise APIError(
            status_code=500,
            error_code="export_failed",
            message=f"Failed to export table: {str(e)}"
        )


@router.get("/database/{db_name}")
def export_database_zip(db_name: str):
    """
    Export all tables from a specific database as a ZIP file containing CSV files.
    
    Parameters:
    - db_name: scandb, repo_scanner_db, or system_scanner_db
    
    Returns ZIP file with all tables as CSV files.
    """
    log.info(f"📦 Exporting entire database: {db_name}")
    
    # Validate database name
    valid_dbs = ['scandb', 'repo_scanner_db', 'system_scanner_db']
    if db_name not in valid_dbs:
        raise APIError(
            status_code=400,
            error_code="invalid_database",
            message=f"Database must be one of: {', '.join(valid_dbs)}"
        )
    
    try:
        # Get all tables
        tables = dashboarder.get_table_names(db_name)
        
        if not tables:
            raise APIError(
                status_code=404,
                error_code="no_tables_found",
                message=f"No tables found in {db_name}"
            )
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for table_name in tables:
                csv_content = dashboarder.export_table_to_csv(db_name, table_name)
                if csv_content:
                    zip_file.writestr(f"{table_name}.csv", csv_content)
        
        zip_buffer.seek(0)
        
        # Return as downloadable ZIP
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={db_name}_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            }
        )
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Database export failed for {db_name}")
        raise APIError(
            status_code=500,
            error_code="database_export_failed",
            message=f"Failed to export database: {str(e)}"
        )


@router.get("/all")
def export_all_databases_zip():
    """
    Export ALL tables from ALL databases as a single ZIP file.
    
    The ZIP structure:
    - scandb/
      - table1.csv
      - table2.csv
    - repo_scanner_db/
      - table1.csv
    - system_scanner_db/
      - table1.csv
    
    Returns ZIP file with complete database export.
    """
    log.info("📦 Exporting ALL databases")
    
    try:
        # Export all tables from all databases
        all_exports = dashboarder.export_all_tables()
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for db_name, tables in all_exports.items():
                for table_name, csv_content in tables.items():
                    # Create folder structure in ZIP
                    zip_file.writestr(f"{db_name}/{table_name}.csv", csv_content)
        
        zip_buffer.seek(0)
        
        # Return as downloadable ZIP
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename=complete_database_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            }
        )
    except Exception as e:
        log.exception("Complete export failed")
        raise APIError(
            status_code=500,
            error_code="complete_export_failed",
            message=f"Failed to export all databases: {str(e)}"
        )


@router.get("/all-with-summary")
def export_all_with_summary():
    """
    Get complete database export with summary and actual data.
    
    Returns comprehensive JSON with:
    1. Summary: Table counts, row counts, column names
    2. Data: Complete data from all tables in all databases
    
    ⚠️ WARNING: This can be a very large response if you have lots of data.
    Use pagination or specific table exports for production systems.
    """
    log.info("📊 Generating complete export with summary and data")
    
    try:
        complete_export = dashboarder.get_complete_export_with_summary()
        
        # Log the size
        export_size_mb = len(json.dumps(complete_export, default=str)) / (1024 * 1024)
        log.info(f"📦 Export size: {export_size_mb:.2f} MB")
        
        if export_size_mb > 100:
            log.warning(f"⚠️  Large export detected: {export_size_mb:.2f} MB")
        
        return complete_export
        
    except Exception as e:
        log.exception("Complete export with summary failed")
        raise APIError(
            status_code=500,
            error_code="complete_export_failed",
            message=f"Failed to generate complete export: {str(e)}"
        )


@router.get("/all-with-summary/download")
def download_all_with_summary():
    """
    Download complete database export as JSON file.
    Same as /export/all-with-summary but as downloadable file.
    """
    log.info("📥 Generating downloadable complete export")
    
    try:
        complete_export = dashboarder.get_complete_export_with_summary()
        
        # Convert to JSON string
        json_content = json.dumps(complete_export, indent=2, default=str)
        
        # Return as downloadable file
        return StreamingResponse(
            io.StringIO(json_content),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=complete_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            }
        )
        
    except Exception as e:
        log.exception("Download export failed")
        raise APIError(
            status_code=500,
            error_code="download_export_failed",
            message=f"Failed to generate download: {str(e)}"
        )


@router.get("/all-with-summary/database/{db_name}")
def export_single_database_with_summary(db_name: str):
    """
    Get complete export for a single database with summary.
    
    Parameters:
    - db_name: scandb, repo_scanner_db, or system_scanner_db
    
    Returns JSON with summary and data for specified database only.
    """
    log.info(f"📊 Generating complete export for {db_name}")
    
    # Validate database name
    valid_dbs = ['scandb', 'repo_scanner_db', 'system_scanner_db']
    if db_name not in valid_dbs:
        raise APIError(
            status_code=400,
            error_code="invalid_database",
            message=f"Database must be one of: {', '.join(valid_dbs)}"
        )
    
    try:
        # Get full export
        complete_export = dashboarder.get_complete_export_with_summary()
        
        # Extract only requested database
        result = {
            "timestamp": complete_export["timestamp"],
            "database": db_name,
            "summary": complete_export["summary"]["databases"].get(db_name, {}),
            "data": complete_export["data"].get(db_name, {})
        }
        
        return result
        
    except Exception as e:
        log.exception(f"Export failed for {db_name}")
        raise APIError(
            status_code=500,
            error_code="database_export_failed",
            message=f"Failed to export {db_name}: {str(e)}"
        )


@router.get("/all-with-summary/table/{db_name}/{table_name}")
def export_single_table_with_summary(db_name: str, table_name: str):
    """
    Get complete export for a single table with summary.
    
    Parameters:
    - db_name: scandb, repo_scanner_db, or system_scanner_db
    - table_name: Name of the table
    
    Returns JSON with summary and data for specified table only.
    """
    log.info(f"📊 Generating complete export for {db_name}.{table_name}")
    
    # Validate database name
    valid_dbs = ['scandb', 'repo_scanner_db', 'system_scanner_db']
    if db_name not in valid_dbs:
        raise APIError(
            status_code=400,
            error_code="invalid_database",
            message=f"Database must be one of: {', '.join(valid_dbs)}"
        )
    
    try:
        # Get table data
        table_data = dashboarder.get_table_data(db_name, table_name)
        
        # Build response
        result = {
            "timestamp": datetime.now().isoformat(),
            "database": db_name,
            "table": table_name,
            "summary": {
                "row_count": len(table_data),
                "columns": list(table_data[0].keys()) if table_data else [],
                "has_data": len(table_data) > 0
            },
            "data": table_data
        }
        
        return result
        
    except Exception as e:
        log.exception(f"Export failed for {db_name}.{table_name}")
        raise APIError(
            status_code=500,
            error_code="table_export_failed",
            message=f"Failed to export {db_name}.{table_name}: {str(e)}"
        )


@router.get("/tables")
def list_all_tables():
    """
    List all available tables across all databases.
    Useful for knowing what can be exported.
    """
    log.info("📋 Listing all tables")
    
    try:
        result = {}
        
        for db_name in ['scandb', 'repo_scanner_db', 'system_scanner_db']:
            tables = dashboarder.get_table_names(db_name)
            result[db_name] = tables
        
        return result
    except Exception as e:
        log.exception("Failed to list tables")
        raise APIError(
            status_code=500,
            error_code="list_tables_failed",
            message=f"Failed to list tables: {str(e)}"
        )