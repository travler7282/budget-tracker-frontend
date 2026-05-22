declare module 'sql.js/dist/sql-wasm-browser.js' {
  export interface SqlJsQueryResult {
    columns: string[];
    values: Array<Array<string | number | bigint | Uint8Array | null>>;
  }

  export interface SqlJsDatabase {
    exec(
      sql: string,
      params?: Array<string | number | bigint | Uint8Array | null>,
    ): SqlJsQueryResult[];
    close(): void;
  }

  export interface SqlJsModule {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsModule>;
}