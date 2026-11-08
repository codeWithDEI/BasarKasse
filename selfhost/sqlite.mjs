import {DatabaseSync} from 'node:sqlite';
// A synchronous SQLite transaction supplies the same atomic batch contract as D1.
export function openDatabase(path){
 const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 class Statement{constructor(sql,bindings=[]){this.sql=sql;this.bindings=bindings}bind(...bindings){return new Statement(this.sql,bindings)}execute(){const statement=sqlite.prepare(this.sql);const results=statement.all(...this.bindings);const meta=sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();return {success:true,results,meta:{changes:Number(meta.changes),last_row_id:Number(meta.last_row_id)}}}async first(column){const row=sqlite.prepare(this.sql).get(...this.bindings);return row?(column?row[column]:row):null}async all(){return this.execute()}async run(){return this.execute()}}
 return {prepare(sql){return new Statement(sql)},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}},async exec(sql){sqlite.exec(sql);return {count:1,duration:0}},close(){sqlite.close()},sqlite};
}
