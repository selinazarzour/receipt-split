"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, LoaderCircle, ReceiptText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { money, paid, splitTotals, type SplitItem } from "@/lib/receipt";

type ClaimReceipt = { id: string; date: string; total: number; people: string[]; items: SplitItem[]; revision: number };
export default function Claim({ token }: { token: string }) {
  const [receipt, setReceipt] = useState<ClaimReceipt | null>(null);
  const [person, setPerson] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const split = useMemo(() => receipt ? splitTotals(receipt.items, receipt.people.length) : null, [receipt]);
  async function load() {
    try {
      const response = await fetch(`/api/claim/${token}`, { cache: "no-store" }); const data = await response.json() as {receipt:ClaimReceipt;error?:string};
      if (!response.ok) throw new Error(data.error);
      setReceipt(data.receipt); if (person !== null) setSelected(data.receipt.items.filter((i: SplitItem)=>i.people.includes(person)).map((i: SplitItem)=>i.id));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load the receipt."); }
  }
  useEffect(() => { void load(); }, [token]);
  function choose(index: number) {
    setPerson(index);
    setSelected(receipt?.items.filter((i)=>i.people.includes(index)).map((i)=>i.id) || []);
    setMessage("");
  }
  function toggle(id: string) { setSelected((prev)=>prev.includes(id)?prev.filter((x)=>x!==id):[...prev,id]); }
  async function save() {
    if (person === null) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/claim/${token}`, { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ person, itemIds: selected }) });
      const data = await response.json() as {receipt:ClaimReceipt;error?:string}; if (!response.ok) throw new Error(data.error);
      setReceipt(data.receipt); setMessage("Saved. The receipt owner can now see your claimed items.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save your choices."); }
    finally { setBusy(false); }
  }
  return <div className="app-shell"><header className="site-header"><a href="/" className="brand"><span className="brand-mark"><ReceiptText size={23}/></span><span>receipt<span className="brand-accent">split</span></span></a><span className="account-name">Shared receipt</span></header>
    <main className="main-wrap claim-wrap"><div className="page-heading"><div><p className="eyebrow">SHARED RECEIPT</p><h1>Pick what’s yours.</h1>
      <p className="intro">Choose your name and mark your items. Items claimed by several people are split evenly.</p></div></div>
      {!receipt ? <div className="claim-loading">{message || "Loading receipt…"}</div> : <div className="claim-layout"><section className="panel"><div className="panel-head"><div><span className="step-label">01 / YOUR NAME</span><h2>Which person are you?</h2></div></div>
        <div className="claim-people">{receipt.people.map((name,index)=><button key={index} className={`claim-person ${person===index?"active":""}`} onClick={()=>choose(index)}><span className="person-dot" style={{background:["#1479f6","#e85b45","#8b5cf6","#00a68a"][index%4]}}/>{name}{person===index&&<Check size={18}/>}</button>)}</div>
        {person !== null && <><div className="panel-head claim-items-head"><div><span className="step-label">02 / YOUR ITEMS</span><h2>Claim your groceries</h2></div></div>
          <div className="claim-items">{receipt.items.map((item)=><label className="claim-item" key={item.id}><Checkbox checked={selected.includes(item.id)} onCheckedChange={()=>toggle(item.id)}/>
            <span><strong>{item.name}</strong><small>{item.people.filter((p)=>p!==person).map((p)=>receipt.people[p]).join(", ")}{item.people.some((p)=>p!==person)?" also selected":""}</small></span><b>{money(paid(item))}</b></label>)}</div>
          <Button className="claim-save" onClick={save} disabled={busy}>{busy?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>} Save my items</Button></>}
      </section><aside className="receipt-summary claim-summary"><div className="summary-head"><ReceiptText size={19}/> RECEIPT</div><div className="summary-line"><span>Date</span><strong>{receipt.date}</strong></div>
        <div className="summary-line"><span>Paid total</span><strong>{money(receipt.total)}</strong></div>
        {person!==null && <><div className="difference balanced"><span>Your current share</span><strong>{money(split?.totals[person]||0)}</strong></div><p className="todo-note">Your share updates after you save your choices.</p></>}
        <button className="refresh-button" onClick={load}><RotateCcw size={15}/> Refresh receipt</button>
      </aside></div>}
      {message && receipt && <div className="notice" role="status"><span>{message}</span><ArrowRight size={16}/></div>}
    </main><footer className="site-footer">Anyone with this link can view this split and claim items. Share it only with the people on the receipt.</footer></div>;
}
