"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, CircleHelp, CloudUpload, Copy, FileText, History, LoaderCircle, Plus, ReceiptText, RotateCcw, Share2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { money, cents, paid, parseReceipt, splitTotals, type SplitItem } from "@/lib/receipt";
import { readReceiptFile } from "@/lib/read-file";
import type { Auth, User } from "firebase/auth";

type SavedReceipt = { id: string; date: string; total: number; people: string[]; items: SplitItem[];
  filename: string | null; createdAt: string; updatedAt: string; revision: number; token: string };

function AmountEditor({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return <label className="amount-editor"><span>{label}</span><Input type="number" step="0.01" value={(value / 100).toFixed(2)}
    onChange={(e) => onChange(cents(e.target.value))} aria-label={label} /></label>;
}

type FirebaseConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };
export default function Workspace({ signedIn, displayName, firebaseConfig, canTransferHistory }: {
  signedIn: boolean; displayName: string; firebaseConfig: FirebaseConfig | null; canTransferHistory: boolean;
}) {
  const [tab, setTab] = useState("split");
  const [people, setPeople] = useState(["", ""]);
  const [items, setItems] = useState<SplitItem[]>([]);
  const [date, setDate] = useState("");
  const [receiptTotal, setReceiptTotal] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const [history, setHistory] = useState<SavedReceipt[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [firebaseAuth, setFirebaseAuth] = useState<Auth | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + paid(item), 0), [items]);
  const difference = receiptTotal - subtotal;
  const unassigned = items.filter((item) => !item.people.length).length;
  const split = useMemo(() => splitTotals(items, people.length), [items, people.length]);
  const ready = items.length > 0 && !difference && !unassigned && people.every((p) => p.trim());
  const isSignedIn = firebaseConfig ? !!firebaseUser : signedIn;
  const accountName = firebaseConfig ? firebaseUser?.displayName || firebaseUser?.email || "" : displayName;

  useEffect(() => {
    if (!firebaseConfig) return;
    let active = true;
    let unsubscribe = () => {};
    import("@/lib/firebase-client").then(async ({ receiptAuth }) => {
      if (!active) return;
      const { onAuthStateChanged } = await import("firebase/auth");
      if (!active) return;
      const auth = receiptAuth(firebaseConfig);
      setFirebaseAuth(auth);
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setFirebaseUser(user);
        if (!user) setHistory([]);
      });
    }).catch(() => setMessage("Google sign-in could not load. Refresh and try again."));
    return () => { active = false; unsubscribe(); };
  }, [firebaseConfig?.projectId]);

  async function authFetch(url: string, options: RequestInit = {}) {
    if (!firebaseConfig) return fetch(url, options);
    const token = await firebaseAuth?.currentUser?.getIdToken();
    return fetch(url, { ...options, headers: { ...options.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  }

  useEffect(() => {
    if (!isSignedIn) return;
    authFetch("/api/receipts", { cache: "no-store" }).then((r) => r.json() as Promise<{receipts?: SavedReceipt[];error?: string}>)
      .then((data) => { if (data.receipts) setHistory(data.receipts); else setMessage(data.error || "Could not load history."); })
      .catch(() => setMessage("Could not load history right now."));
  }, [isSignedIn, firebaseUser?.uid]);

  async function startGoogleSignIn() {
    if (!firebaseAuth) { setMessage("Google sign-in is loading. Try again in a moment."); return; }
    try {
      const { signInWithGoogle } = await import("@/lib/firebase-client");
      await signInWithGoogle(firebaseAuth);
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Google sign-in failed."); }
  }
  async function transferHistory() {
    try {
      const response = await authFetch("/api/receipts/transfer", { method: "POST" });
      const data = await response.json() as {moved?: number; error?: string};
      if (!response.ok) throw new Error(data.error || "Transfer failed.");
      const updated = await authFetch("/api/receipts", { cache: "no-store" });
      const result = await updated.json() as {receipts?: SavedReceipt[]};
      if (result.receipts) setHistory(result.receipts);
      setMessage(`${data.moved || 0} earlier receipts moved to your Google account.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not transfer receipts."); }
  }

  const update = (id: string, patch: Partial<SplitItem>) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
    setShowResults(false);
  };
  const reset = () => { setItems([]); setPeople(["", ""]); setDate(""); setReceiptTotal(0); setFile(null); setSaved(null); setNotes([]); setMessage(""); setShowResults(false); setEditing(null); };

  async function upload(nextFile: File) {
    if (nextFile.size > 12_000_000) { setMessage("Choose a file smaller than 12 MB."); return; }
    reset(); setBusy("Opening receipt…"); setFile(nextFile);
    try {
      const text = await readReceiptFile(nextFile, setBusy);
      const parsed = parseReceipt(text);
      setItems(parsed.items); setDate(parsed.date); setReceiptTotal(parsed.total); setNotes(parsed.notes);
      if (!parsed.items.length) setMessage("No items were recognized. Try a clearer image or add the lines manually below.");
      else setMessage(`${parsed.items.length} items found. Review the amounts, then choose who uses each item.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not read the receipt. Try another file."); }
    finally { setBusy(""); }
  }

  function addLine() {
    setItems((prev) => [...prev, { id: crypto.randomUUID(), name: "New item", category: "Other", original: 0,
      itemDiscount: 0, categoryDiscount: 0, tax: 0, people: [] }]);
    setShowResults(false);
  }
  function setPersonCount(value: number) {
    const count = Math.max(2, Math.min(12, Math.round(value)));
    setPeople((prev) => Array.from({ length: count }, (_, index) => prev[index] || ""));
    setItems((prev) => prev.map((item) => ({ ...item, people: item.people.filter((index) => index < count) })));
    setShowResults(false);
  }
  function togglePerson(item: SplitItem, index: number) {
    update(item.id, { people: item.people.includes(index) ? item.people.filter((p) => p !== index) : [...item.people, index].sort((a,b) => a-b) });
  }
  function chooseAll(item: SplitItem) {
    update(item.id, { people: people.map((_, i) => i) });
  }
  function openHistory(receipt: SavedReceipt) {
    setSaved(receipt); setItems(receipt.items); setPeople(receipt.people); setDate(receipt.date);
    setReceiptTotal(receipt.total); setFile(null); setNotes([]); setMessage(""); setShowResults(false); setTab("split");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function refreshClaims() {
    if (!saved) return;
    setBusy("Refreshing claims…");
    try { const response = await authFetch(`/api/receipts/${saved.id}`, { cache: "no-store" }); const data = await response.json() as {receipt:SavedReceipt;error?:string};
      if (!response.ok) throw new Error(data.error); openHistory(data.receipt);
      setMessage("Latest claims loaded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not refresh claims."); }
    finally { setBusy(""); }
  }
  async function saveReceipt() {
    if (!isSignedIn) { setMessage("Sign in to save your receipt and create a share link."); return; }
    if (!date || !people.every((p) => p.trim()) || difference || !items.length) { setMessage("Fill in the names and make the item amounts match the paid total before saving."); return; }
    setBusy("Saving receipt…"); setMessage("");
    const payload = { date, total: receiptTotal, people, items };
    try {
      const endpoint = saved ? `/api/receipts/${saved.id}` : "/api/receipts";
      let options: RequestInit;
      if (saved) options = { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, revision: saved.revision }) };
      else { const body = new FormData(); body.append("receipt", JSON.stringify(payload)); if (file) body.append("file", file); options = { method: "POST", body }; }
      const response = await authFetch(endpoint, options); const data = await response.json() as {receipt:SavedReceipt;error?:string};
      if (!response.ok) throw new Error(data.error || "Could not save.");
      setSaved(data.receipt); setHistory((prev) => [data.receipt, ...prev.filter((r) => r.id !== data.receipt.id)]);
      setMessage("Saved. You can now share the claim link or return to this receipt later.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the receipt."); }
    finally { setBusy(""); }
  }
  async function copyLink() {
    if (!saved) return;
    const url = `${window.location.origin}/claim/${saved.token}`;
    try { await navigator.clipboard.writeText(url); setMessage("Claim link copied. Anyone with this link can claim items on this receipt."); }
    catch { setMessage(`Copy this claim link: ${url}`); }
  }
  async function removeReceipt(id: string) {
    try { const response = await authFetch(`/api/receipts/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(((await response.json()) as {error:string}).error);
      setHistory((prev) => prev.filter((r) => r.id !== id)); if (saved?.id === id) reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete the receipt."); }
  }
  function exportHistory() {
    const records = history.map(({ token: _token, ...receipt }) => receipt);
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), receipts: records }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "metro-split-history.json"; link.click();
    URL.revokeObjectURL(url);
  }
  async function viewOriginal(id: string) {
    try {
      const response = await authFetch(`/api/receipts/${id}?file`);
      if (!response.ok) throw new Error("Original receipt unavailable.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.target = "_blank"; link.rel = "noopener"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open the original receipt."); }
  }

  return <div className="app-shell">
    <header className="site-header"><div className="brand"><span className="brand-mark"><ReceiptText size={23} strokeWidth={2.2} /></span>
      <span>receipt<span className="brand-accent">split</span></span></div>
      <div className="header-right">{isSignedIn ? <><span className="account-name">{accountName}</span>
        {firebaseConfig && <button className="sign-in" onClick={async()=>{if(firebaseAuth){const {signOut}=await import("@/lib/firebase-client"); await signOut(firebaseAuth);}}}>Sign out</button>}</> :
        firebaseConfig ? <button className="sign-in" onClick={startGoogleSignIn}>Sign in with Google <ArrowRight size={15} /></button> :
        <a className="sign-in" href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in to save <ArrowRight size={15} /></a>}
      </div></header>
    <main className="main-wrap">
      <div className="page-heading"><div><p className="eyebrow">RECEIPT WORKSPACE</p><h1>Split the shop, fairly.</h1>
        <p className="intro">Upload a receipt, choose who got each item, and keep the exact split.</p></div>
        {items.length > 0 && <Button variant="outline" onClick={reset}><Plus size={16}/> New receipt</Button>}
      </div>
      <Tabs value={tab} onValueChange={setTab} className="workspace-tabs"><TabsList variant="line" className="top-tabs">
        <TabsTrigger value="split"><ReceiptText size={16}/> New split</TabsTrigger>
        <TabsTrigger value="history"><History size={16}/> History {history.length ? <span className="count">{history.length}</span> : null}</TabsTrigger>
      </TabsList>
      <TabsContent value="split" className="tab-content">
        {!items.length && <section className="upload-card"><div className="upload-copy"><span className="step-label">01 / UPLOAD</span>
          <h2>Your receipt, ready to split.</h2><p>Upload a receipt PDF or photo. Metro receipts are recognized in detail; for other stores, review and edit the extracted lines.</p>
          <div className="feature-line"><Check size={16}/> Check every amount before saving</div>
          <div className="feature-line"><Check size={16}/> Invite someone to claim their items</div></div>
          <div className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)}
            onDrop={(e)=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files[0]) upload(e.dataTransfer.files[0])}}>
            <input ref={fileInput} type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e)=>{if(e.target.files?.[0]) upload(e.target.files[0]); e.target.value=""}} />
            <span className="upload-icon"><CloudUpload size={26}/></span><strong>Drop a receipt here</strong><span>or select a PDF, JPG, PNG, or WebP file</span>
            <Button onClick={()=>fileInput.current?.click()} disabled={!!busy}>Choose receipt <ArrowRight size={16}/></Button><small>Up to 12 MB · Read on your device</small>
            <button className="manual-link" onClick={()=>{addLine();setDate(new Date().toISOString().slice(0,10));setFile(null)}}>Enter items manually</button>
          </div></section>}
        {items.length > 0 && <div className="work-layout"><div className="work-main">
          <section className="panel"><div className="panel-head"><div><span className="step-label">01 / PEOPLE</span><h2>Who’s splitting this?</h2></div><label className="people-count">Number of people<Input type="number" min="2" max="12" value={people.length} onChange={(e)=>{if(e.target.value) setPersonCount(Number(e.target.value))}} aria-label="Number of people" /></label></div>
            <div className="person-grid">{people.map((person, i)=><label className="person-field" key={i}><span>Person {i+1}</span>
              <div className="person-input"><span className="person-dot" style={{ background: ["#1479f6","#e85b45","#8b5cf6","#00a68a"][i%4] }}/>
                <Input value={person} onChange={(e)=>setPeople((prev)=>prev.map((p,j)=>i===j?e.target.value:p))} placeholder="Enter member’s name" maxLength={50}/>
                {people.length>2 && <button title="Remove person" onClick={()=>{setPeople((prev)=>prev.filter((_,j)=>j!==i));setItems((prev)=>prev.map((item)=>({...item,people:item.people.filter((p)=>p!==i).map((p)=>p>i?p-1:p)})))}}><X size={15}/></button>}</div>
            </label>)}<Button variant="outline" className="add-person" disabled={people.length>=12} onClick={()=>setPeople((prev)=>[...prev,""])}><Plus size={16}/> Add person</Button></div>
          </section>
          <section className="panel items-panel"><div className="panel-head"><div><span className="step-label">02 / ITEMS</span><h2>Assign the items</h2></div><span className="small-meta">{items.length} items</span></div>
            <p className="panel-help">Tap one name for a personal item, or several names to split it equally. Multiple packs appear separately.</p>
            <div className="items-list">{items.map((item)=><div className="item-row" key={item.id}><div className="item-main"><div><strong>{item.name}</strong><span className="item-category">{item.category}</span></div><div className="item-price">{money(paid(item))}</div></div>
              <div className="item-actions"><div className="assign-chips">{people.map((person,i)=><button type="button" key={i} className={`chip ${item.people.includes(i)?"selected":""}`} onClick={()=>togglePerson(item,i)} aria-pressed={item.people.includes(i)}>{person||`Person ${i+1}`}</button>)}
                <button type="button" className="all-chip" onClick={()=>chooseAll(item)}>All</button></div>
                <button className="detail-button" onClick={()=>setEditing(editing===item.id?null:item.id)}>{editing===item.id?"Close":"Details"} <ChevronRight size={14}/></button></div>
              {editing===item.id && <div className="item-detail"><label className="item-name-editor">Item name<Input value={item.name} onChange={(e)=>update(item.id,{name:e.target.value})}/></label>
                <div className="amount-grid"><AmountEditor label="Printed price" value={item.original} onChange={(v)=>update(item.id,{original:v})}/><AmountEditor label="Item discount" value={item.itemDiscount} onChange={(v)=>update(item.id,{itemDiscount:v})}/>
                  <AmountEditor label="Category discount" value={item.categoryDiscount} onChange={(v)=>update(item.id,{categoryDiscount:v})}/><AmountEditor label="Tax / rebate" value={item.tax} onChange={(v)=>update(item.id,{tax:v})}/></div>
                <button className="remove-line" onClick={()=>setItems((prev)=>prev.filter((r)=>r.id!==item.id))}><Trash2 size={14}/> Remove line</button></div>}
            </div>)}</div><Button variant="outline" className="add-line" onClick={addLine}><Plus size={16}/> Add missing item</Button>
          </section>
        </div><aside className="summary-column"><section className="receipt-summary"><div className="summary-head"><ReceiptText size={19}/><span>RECEIPT SUMMARY</span></div>
            <label>Purchase date<Input type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></label>
            <label>Amount paid<Input type="number" step="0.01" value={(receiptTotal/100).toFixed(2)} onChange={(e)=>setReceiptTotal(cents(e.target.value))}/></label>
            <div className="summary-line"><span>Items after discounts + tax</span><strong>{money(subtotal)}</strong></div>
            <div className={`difference ${difference===0?"balanced":""}`}><span>{difference===0?"Amounts match":"Difference to review"}</span><strong>{money(difference)}</strong></div>
            {unassigned>0 && <p className="todo-note">{unassigned} {unassigned===1?"item needs":"items need"} an owner.</p>}
            <Button className="compute-button" disabled={!ready} onClick={()=>setShowResults(true)}>Compute split <ArrowRight size={17}/></Button>
            <Button variant="outline" className="save-button" disabled={!!difference||!items.length||!!busy} onClick={saveReceipt}>{saved?"Save changes":"Save receipt & get share link"}</Button>
            {!isSignedIn && <p className="sign-note">{firebaseConfig ?
              <button onClick={startGoogleSignIn}>Sign in with Google</button> :
              <a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT</a>} to save history and share a claim link.</p>}
            {saved && <div className="share-area"><p>Let someone pick their items</p><Button variant="outline" onClick={copyLink}><Share2 size={16}/> Copy claim link</Button>
              <button onClick={refreshClaims}><RotateCcw size={14}/> Refresh claims</button></div>}
            {file && <div className="file-detail"><FileText size={17}/><span>{file.name}</span></div>}
            {saved?.filename && !file && <button className="file-detail file-link" onClick={()=>viewOriginal(saved.id)}><FileText size={17}/><span>View original receipt</span></button>}
          </section></aside></div>}
        {items.length>0 && notes.length>0 && <div className="parser-notes"><CircleHelp size={17}/><div>{notes.map((note,i)=><p key={i}>{note}</p>)}</div></div>}
        {showResults && ready && <section className="results-panel"><div className="results-head"><span className="step-label">03 / THE SPLIT</span><h2>Everyone’s share</h2><p>Amounts below include the receipt’s discounts and tax.</p></div>
          <div className="total-cards">{people.map((person,i)=><div className="total-card" key={i}><span className="person-dot" style={{background:["#1479f6","#e85b45","#8b5cf6","#00a68a"][i%4]}}/><span>{person}</span><strong>{money(split.totals[i])}</strong></div>)}</div>
          <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Paid</TableHead>{people.map((p,i)=><TableHead key={i} className="text-right">{p}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{items.map((item,i)=><TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell className="text-right">{money(paid(item))}</TableCell>{split.rows[i].map((amount,j)=><TableCell key={j} className="text-right">{amount?money(amount):"—"}</TableCell>)}</TableRow>)}</TableBody></Table>
          <div className="results-foot"><strong>Total paid {money(receiptTotal)}</strong><span>{split.totals.map((n,i)=>`${people[i]} ${money(n)}`).join(" · ")}</span></div>
        </section>}
      </TabsContent>
      <TabsContent value="history" className="tab-content"><section className="history-panel"><div className="panel-head"><div><span className="step-label">YOUR RECEIPTS</span><h2>Past splits</h2></div>{history.length>0 && <Button variant="outline" onClick={exportHistory}>Download history</Button>}</div>
        {!isSignedIn ? <div className="empty-history"><History size={30}/><p>Sign in to see receipts saved across your devices.</p>{firebaseConfig ?
          <button onClick={startGoogleSignIn}>Sign in with Google <ArrowRight size={16}/></button> :
          <a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT <ArrowRight size={16}/></a>}</div> :
          history.length===0 ? <div className="empty-history"><History size={30}/><p>No saved receipts yet. Upload a receipt to start.</p><Button variant="outline" onClick={()=>setTab("split")}>Split a receipt</Button></div> :
          <div className="history-list">{history.map((receipt)=><div className="history-row" key={receipt.id}><span className="history-icon"><ReceiptText size={20}/></span>
            <button className="history-open" onClick={()=>openHistory(receipt)}><strong>{new Date(`${receipt.date}T12:00:00`).toLocaleDateString("en-CA",{year:"numeric",month:"long",day:"numeric"})}</strong><span>{receipt.people.join(" · ")} · {receipt.items.length} items</span></button>
            <strong className="history-total">{money(receipt.total)}</strong><Button variant="ghost" size="icon" title="Open receipt" onClick={()=>openHistory(receipt)}><ChevronRight size={17}/></Button>
            <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" title="Delete receipt"><Trash2 size={16}/></Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this receipt?</AlertDialogTitle><AlertDialogDescription>The split and original file will be removed from your history. The claim link will stop working.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Keep receipt</AlertDialogCancel><AlertDialogAction onClick={()=>removeReceipt(receipt.id)}>Delete receipt</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
          </div>)}</div>}
        {firebaseConfig && isSignedIn && <div className="history-transfer"><p>Used ChatGPT sign-in here before? Transfer your earlier receipts to this Google account.</p>
          {canTransferHistory ? <Button variant="outline" onClick={transferHistory}>Transfer earlier receipts</Button> :
          <a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in to your earlier ChatGPT account, then return here</a>}</div>}
      </section></TabsContent></Tabs>
      {busy && <div className="status" role="status"><LoaderCircle size={17} className="spin"/>{busy}</div>}
      {message && <div className="notice" role="status"><span>{message}</span><button aria-label="Dismiss" onClick={()=>setMessage("")}><X size={16}/></button></div>}
    </main><footer className="site-footer">Receipt prices are checked against the amount paid. Review OCR results before saving.</footer>
  </div>;
}
