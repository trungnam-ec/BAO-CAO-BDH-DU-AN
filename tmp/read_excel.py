import sys
import pandas as pd

def read_excel():
    file_path = "2026.03.26 BAO CAO NGAY.xlsx"
    print(f"Reading {file_path}")
    try:
        # pip install openpyxl if needed
        xl = pd.ExcelFile(file_path, engine='openpyxl')
        for sheet_name in xl.sheet_names:
            df = xl.parse(sheet_name)
            print(f"--- Sheet: {sheet_name} ---")
            print("Columns:")
            print(df.columns.tolist())
            print("First 3 rows:")
            print(df.head(3).to_string())
    except Exception as e:
        print(f"Error reading file check openpyxl. Error: {e}")

if __name__ == "__main__":
    read_excel()
