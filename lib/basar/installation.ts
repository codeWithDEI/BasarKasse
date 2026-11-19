import {database} from './database';
import {ApiError} from './operations';
export type Installation={installation_id:string;mode:'evaluation'|'production';phase:'evaluation'|'prepared'|'live'};
export function productionMode(){
 const mode=process.env.BASAR_MODE||'evaluation';
 if(!['evaluation','production'].includes(mode))throw new ApiError('Die Betriebsart ist ungültig konfiguriert.',503,'MODE_MISMATCH');
 return mode==='production';
}
export async function installation(){
 const row=await database().prepare('SELECT installation_id,mode,phase FROM installation WHERE id=1').first<Installation>();
 if(!row||row.mode!==(productionMode()?'production':'evaluation'))throw new ApiError('Datenbank und Betriebsart passen nicht zusammen. Bitte die technische Leitung hinzuziehen.',503,'MODE_MISMATCH');
 return row;
}
