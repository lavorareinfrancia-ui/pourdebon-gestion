"use client";

import { useEffect, useMemo, useState } from "react";

type Offer = { shop_sku?: string|null; product_sku?: string|null; product_title?: string|null; price?: number|null; quantity?: number|null };
type Woo = { name?: string|null; sku?: string|null; price?: number|null; parent_name?: string|null };
type OfferPage = { offers?: Offer[]; total_count?: number; error?: string };

const wrapper: React.CSSProperties = { maxWidth: 1120, margin:"0 auto", padding:"32px 18px",fontFamily:"Arial, sans-serif",color:"#22332d" };
const button: React.CSSProperties = { padding:"12px 17px",border:"1px solid #c8d6ce",borderRadius:10,background:"white",cursor:"pointer",color:"#244c38" };
const small: React.CSSProperties = {fontSize:13,color:"#586a61"};
const card: React.CSSProperties = {border:"1px solid #dce6de",borderRadius:16,padding:20,background:"white"};

function normalize(x: string|null|undefined) { return (x??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
function money(n: number|null|undefined) {return typeof n==="number"&&Number.isFinite(n)? n.toLocaleString("fr-FR",{style:"currency",currency:"EUR"}):"—";}
async function readJson(url: string) {
  const response=await fetch(url,{cache:"no-store"});
  const data=await response.json().catch(()=>({error:"Réponse invalide"}));
  if(!response.ok) throw new Error(data.error||"Lecture indisponible");
  return data;
}

export default function Controle() {
  const [offers,setOffers]=useState<Offer[]>([]);
  const [woo,setWoo]=useState<Woo[]>([]);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [filter,setFilter]=useState("");
  const [onlyIssues,setOnlyIssues]=useState(false);
  const [lastUpdate,setLastUpdate]=useState("");

  async function refresh() {
    setLoading(true); setError("");
    try {
      const shopPromise=readJson("/api/shop/products");
      const catalog:Offer[]=[];
      let offset=0;let total:number|null=null;let finished=false;
      for(let page=0;page<100;page++){
        const data=await readJson("/api/pourdebon/offers?max=100&offset="+offset) as OfferPage;
        if(!Array.isArray(data.offers))throw new Error("Catalogue Pourdebon incomplet");
        catalog.push(...data.offers);
        if(typeof data.total_count==="number")total=data.total_count;
        offset+=data.offers.length;
        if(data.offers.length===0 || data.offers.length<100 || (total!==null && offset>=total)){finished=true;break;}
      }
      if(!finished)throw new Error("Catalogue incomplet : limite de pagination atteinte");
      const shop=await shopPromise;
      if(!Array.isArray(shop.products))throw new Error("Catalogue WooCommerce indisponible");
      setOffers(catalog);setWoo(shop.products);setLastUpdate(new Date().toLocaleString("fr-FR"));
    } catch(e) {setError(e instanceof Error?e.message:"Erreur de chargement");}
    finally {setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  const rows=useMemo(()=>{
    const skus=new Map<string,Woo[]>();
    for(const product of woo){if(!product.sku)continue;const key=normalize(product.sku);skus.set(key,[...(skus.get(key)??[]),product]);}
    return offers.map(o=>{
      const hits=skus.get(normalize(o.shop_sku))??skus.get(normalize(o.product_sku))??[];
      const match=hits.length===1?hits[0]:null;
      const flags:string[]=[];
      if(!o.shop_sku)flags.push("SKU manquant");
      if(o.price==null)flags.push("Prix manquant");
      if(o.quantity==null)flags.push("Stock non renseigné");
      if(o.quantity===0)flags.push("Stock à zéro");
      if(!match)flags.push(hits.length>1?"SKU ambigu":"Correspondance boutique non vérifiée");
      return {o,match,flags};
    });
  },[offers,woo]);
  const shown=rows.filter(r=>(!onlyIssues||r.flags.length>0)&&normalize(r.o.product_title+" "+r.o.shop_sku).includes(normalize(filter)));
  return <main style={{minHeight:"100vh",background:"#f5f7f4"}}>
    <div style={wrapper}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <div><p style={small}>PASTA PIEMONTE · POURDEBON</p><h1 style={{margin:"5px 0 10px",fontSize:30}}>Centre de contrôle commercial</h1><p style={small}>Lecture seule · Aucune modification de prix ou de stock depuis cette page</p></div>
        <button style={button} disabled={loading} onClick={()=>void refresh()}>{loading?"Actualisation…":"↻ Actualiser"}</button>
      </div>
      {error && <div role="alert" style={{...card,borderColor:"#bc6a55",margin:"20px 0",color:"#902e20"}}>Chargement impossible : {error}. Les données précédentes peuvent être périmées.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,margin:"24px 0"}}>
        {[["Offres lues",rows.length],["À vérifier",rows.filter(r=>r.flags.length).length],["Stock à zéro",rows.filter(r=>r.o.quantity===0).length],["Correspondances SKU",rows.filter(r=>r.match).length]].map(([title,value])=><div key={title} style={card}><div style={small}>{title}</div><div style={{fontSize:28,fontWeight:700,marginTop:9}}>{value}</div></div>)}
      </div>
      <div style={{...card,marginBottom:16}}>
        <h2 style={{fontSize:18,marginTop:0}}>Mes priorités</h2>
        <p style={{marginBottom:5}}>Les prix et le stock sont consultables. Les changements restent bloqués tant que l'authentification administrateur et la vérification des importations Mirakl ne sont pas validées.</p>
        <p style={small}>La correspondance avec WooCommerce est volontairement prudente : seuls les SKU uniques identiques sont rapprochés. Une absence de correspondance n'est pas une erreur de catalogue prouvée.</p>
      </div>
      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",margin:"16px 0"}}>
        <input aria-label="Rechercher un produit" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Chercher un produit ou SKU…" style={{...button,minWidth:240,flex:1}}/>
        <label style={small}><input type="checkbox" checked={onlyIssues} onChange={e=>setOnlyIssues(e.target.checked)}/> Seulement à vérifier</label>
      </div>
      <div style={{...card,overflowX:"auto",padding:0}}>
        <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
          <thead><tr style={{background:"#edf2ed"}}>{["Offre Pourdebon","Prix TTC","Stock","WooCommerce","Diagnostic"].map(x=><th key={x} style={{padding:13,fontSize:13}}>{x}</th>)}</tr></thead>
          <tbody>{shown.map((r,i)=><tr key={(r.o.shop_sku??"sans-sku")+i} style={{borderTop:"1px solid #e3ebe3"}}>
            <td style={{padding:13}}><strong>{r.o.product_title||"Sans titre"}</strong><div style={small}>{r.o.shop_sku||"SKU manquant"}</div></td>
            <td style={{padding:13}}>{money(r.o.price)}</td><td style={{padding:13}}>{r.o.quantity??"—"}</td>
            <td style={{padding:13}}>{r.match?<>{r.match.name}<div style={small}>{money(r.match.price)}</div></>:"À rapprocher"}</td>
            <td style={{padding:13,fontSize:13}}>{r.flags.length?r.flags.join(" · "):"Aucune anomalie détectée par les contrôles de base"}</td>
          </tr>)}</tbody>
        </table>
        {!shown.length&&<p style={{padding:18}}>Aucun résultat pour ces filtres.</p>}
      </div>
      <p style={{...small,marginTop:18}}>Dernière lecture : {lastUpdate||"non disponible"} · Les offres visibles via API ne prouvent pas leur affichage sur la boutique BtoC Pourdebon. Vérification finale dans le back-office nécessaire.</p>
      <p style={small}><a href="/" style={{color:"#2f6445"}}>Audit des prix existant</a> · <a href="/ravioli-750" style={{color:"#2f6445"}}>Diagnostic raviolis 750 g</a></p>
    </div>
  </main>;
}
