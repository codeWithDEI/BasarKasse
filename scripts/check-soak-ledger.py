"""Independent, read-only oracle for the synthetic soak fixture, after event closure."""
import argparse, collections, hashlib, json, pathlib, re, sqlite3, time, datetime

def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

def snapshot(path):
    db=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=2)
    db.row_factory=sqlite3.Row
    try:
        db.execute('BEGIN')
        event=db.execute("SELECT * FROM events WHERE name LIKE 'Isolated Ubuntu soak %'").fetchone()
        if not event or event['status']!='closed': return None
        data={'event':dict(event),'staff':[dict(row) for row in db.execute('SELECT id,name,role FROM staff')]}
        for table in ['sales','payouts','movements','operations','audit','till_sessions']:
            data[table]=[dict(row) for row in db.execute('SELECT * FROM '+table+' WHERE event_id=?',(event['id'],))]
        return data
    finally: db.close()

def verify(data,seed):
    event=data['event']; assert event['commission']==1500 and event['status']=='closed'
    sales=data['sales']; staff={row['id']:row for row in data['staff']}; tills={row['id']:row for row in data['till_sessions']}
    assert len(tills)==6 and {row['number'] for row in tills.values()}==set(range(1,7))
    assert {row['number'] for row in sales}==set(range(1,len(sales)+1)), 'Receipt sequence differs'
    sale_ops={}; hashes=collections.defaultdict(collections.Counter)
    for op in data['operations']:
        assert op['outcome']=='committed', 'Unexpected rejected workload operation'
        hashes[op['action']][op['request_hash']]+=1
        if op['action']=='sale':
            result=json.loads(op['result']); assert result['saleId'] not in sale_ops, 'Duplicate sale effect'
            sale_ops[result['saleId']]=(op,result)
    assert len(sale_ops)==len(sales), 'Sale operation count differs'
    gross=collections.Counter(); cash={key:row['opening'] for key,row in tills.items()}; void_hashes=collections.Counter(); goods=donations=new_intents=0
    for sale in sales:
        number=sale['number']; items=json.loads(sale['items']); assert len(items)==5
        assert len({item['id'] for item in items})==5, 'Duplicate basket line'
        if number<=seed:
            expected=[((number+k)%150+1,100) for k in range(5)]; assert sale['staff_id']=='fixture'
            assert tills[sale['till_id']]['number']==(number-1)%6+1
        else:
            actor=staff[sale['staff_id']]; match=re.fullmatch(r'Synthetic cashier (\d+)',actor['name']); assert match and actor['role']=='cashier'
            index=int(match.group(1)); assert 0<=index<12
            expected=[(index+1,100+index)]*5; assert tills[sale['till_id']]['number']==index%6+1
        assert [(item['seller'],item['price']) for item in items]==expected, 'Stored items differ from fixture intent'
        total=sum(price for _,price in expected); assert sale['total']==total and sale['donation']==5 and sale['received']==1000
        op,result=sale_ops[sale['id']]; assert op['staff_id']==sale['staff_id']
        for key,value in [('number',number),('total',total),('donation',5),('received',1000),('change',1000-total-5)]: assert result[key]==value, 'Stored receipt result differs'
        if number>seed:
            intent={'tillId':sale['till_id'],'items':[{'id':i['id'],'seller':i['seller'],'price':i['price']} for i in items],'received':1000,'donation':5}
            assert op['request_hash']==fingerprint(intent), 'Stored rows differ from original command fingerprint'
            new_intents+=1
        if sale['voided_at']:
            assert sale['void_reason']=='Synthetic soak refund'
            void_hashes[fingerprint({'saleId':sale['id'],'reason':sale['void_reason']})]+=1
        else:
            for seller,price in expected: gross[seller]+=price
            cash[sale['till_id']]+=total+5; goods+=total; donations+=5
    assert hashes['void']==void_hashes, 'Void outcomes differ from their intents'
    movements=data['movements']; movement_hashes=collections.Counter(); signs=collections.Counter()
    for row in movements:
        assert tills[row['till_id']]['number']==1 and row['amount'] in [100,-100]
        assert row['reason']==('Synthetic soak cash in' if row['amount']>0 else 'Synthetic soak cash out')
        cash[row['till_id']]+=row['amount'];signs[row['amount']]+=1
        movement_hashes[fingerprint({'tillId':row['till_id'],'amount':row['amount'],'reason':row['reason']})]+=1
    assert signs[100]==signs[-100] and hashes['movement']==movement_hashes, 'Cash movement effects differ'
    payouts=data['payouts']; assert len(payouts)==len(gross) and {p['seller'] for p in payouts}==set(gross), 'Seller claims missing or duplicated'
    payout_hashes=collections.Counter(); net_total=commission_total=0
    for payout in payouts:
        expected_gross=gross[payout['seller']]; commission=(expected_gross*1500+5000)//10000; net=expected_gross-commission
        assert (payout['gross'],payout['commission'],payout['net'])==(expected_gross,commission,net), 'Individual seller payout differs'
        cash[payout['till_id']]-=net;net_total+=net;commission_total+=commission
        payout_hashes[fingerprint({'seller':payout['seller'],'tillId':payout['till_id']})]+=1
    assert hashes['payout']==payout_hashes, 'Payout effects differ from their intents'
    for key,till in tills.items():
        assert till['closed_at'] and till['opening']==10000
        assert till['counted']==cash[key] and till['expected']==cash[key], 'Independent till balance differs'
    assert sum(cash.values())==60000+goods+donations-net_total
    assert sum(1 for row in data['audit'] if row['action']=='Verkauf')==len(sales)
    assert sum(1 for row in data['audit'] if row['action']=='Verkäufer ausgezahlt')==len(payouts)
    assert sum(1 for row in data['audit'] if row['action']=='Kassenabschluss')==6
    return {'receiptsVerified':len(sales),'newCommandFingerprintsVerified':new_intents,'voidsVerified':sum(void_hashes.values()),'movementsVerified':len(movements),'individualSellerPayoutsVerified':len(payouts),'tillsVerified':6,'goodsCents':goods,'donationCents':donations,'commissionCents':commission_total,'netPayoutCents':net_total,'finalCashCents':sum(cash.values())}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('scratch');parser.add_argument('output');parser.add_argument('--seed',type=int,default=10000);parser.add_argument('--wait-seconds',type=int,default=1200);args=parser.parse_args()
    deadline=time.monotonic()+args.wait_seconds
    try:
        while time.monotonic()<deadline:
            for path in pathlib.Path(args.scratch).glob('basar-soak-*/source.sqlite'):
                try: data=snapshot(path.resolve())
                except (sqlite3.Error,FileNotFoundError): continue
                if data is not None:
                    pathlib.Path(args.output+'.fixture.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
                    result=verify(data,args.seed)
                    damaged={**data,'payouts':[dict(row) for row in data['payouts']]}
                    pair=next((a,b) for a in range(len(damaged['payouts'])) for b in range(a+1,len(damaged['payouts'])) if damaged['payouts'][a]['till_id']==damaged['payouts'][b]['till_id'])
                    damaged['payouts'][pair[0]]['net']+=1;damaged['payouts'][pair[1]]['net']-=1
                    try: verify(damaged,args.seed)
                    except AssertionError: result['detectsCompensatingPayoutErrors']=True
                    else: raise AssertionError('Oracle missed compensating payout errors')
                    report={'status':'passed','verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Independent Python/SQLite read-only post-closure snapshot; fixture intents, command hashes, each seller and each till','results':result}
                    pathlib.Path(args.output).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));return
            time.sleep(.25)
        raise RuntimeError('No closed soak fixture observed before deadline')
    except Exception as error:
        pathlib.Path(args.output).write_text(json.dumps({'status':'failed','error':str(error)})+'\n');raise
if __name__=='__main__':main()
