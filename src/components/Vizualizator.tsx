// Vizualizarea modelelor IFC în browser (three.js + web-ifc): rotire, încadrare,
// niveluri, discipline, secțiune orizontală și proprietățile elementului ales.
// Se încarcă doar când e deschisă (import dinamic), ca restul aplicației să rămână ușor.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IfcAPI } from 'web-ifc';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import { citesteStructura, numeClasa, proprietati, type ProprietatiIfc, type StructuraIfc } from '../lib/ifc';

export type ModelDeAfisat = { cheie: string; nume: string; culoare: string; date: ArrayBuffer };
export type ModelIncarcat = { cheie: string; nume: string; structura: StructuraIfc; elemente: number };
type Props = { modele: ModelDeAfisat[]; onIncarcate?: (m: ModelIncarcat[]) => void };

type Stare = {
  api: IfcAPI; scena: THREE.Scene; camera: THREE.PerspectiveCamera; randare: THREE.WebGLRenderer; control: OrbitControls;
  grupuri: Map<string, { grup: THREE.Group; modelID: number; structura: StructuraIfc }>;
  plan: THREE.Plane; cutie: THREE.Box3; decalaj: THREE.Vector3 | null; materiale: Set<THREE.Material>; ales: THREE.Mesh[]; original: Map<THREE.Mesh, THREE.Material>;
};

let apiGlobal: Promise<IfcAPI> | null = null;
function apiIfc() {
  apiGlobal ??= (async () => { const a = new IfcAPI(); await a.Init(() => wasmUrl, true); return a; })();
  return apiGlobal;
}

export default function Vizualizator({ modele, onIncarcate }: Props) {
  const gazda = useRef<HTMLDivElement>(null);
  const st = useRef<Stare | null>(null);
  const [progres, setProgres] = useState<string | null>('Se pregătește vizualizarea…');
  const [eroare, setEroare] = useState<string | null>(null);
  const [incarcate, setIncarcate] = useState<ModelIncarcat[]>([]);
  const [vizibile, setVizibile] = useState<Record<string, boolean>>({});
  const [niveluri, setNiveluri] = useState<{ nume: string; cota: number | null; chei: string[] }[]>([]);
  const [nivAscunse, setNivAscunse] = useState<Set<string>>(new Set());
  const [sectiune, setSectiune] = useState<{ activa: boolean; h: number; min: number; max: number }>({ activa: false, h: 0, min: 0, max: 1 });
  const [prop, setProp] = useState<(ProprietatiIfc & { model: string }) | null>(null);

  // scena, o singură dată
  useEffect(() => {
    const el = gazda.current!;
    const randare = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    randare.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    randare.localClippingEnabled = true;
    el.appendChild(randare.domElement);
    const scena = new THREE.Scene();
    scena.background = new THREE.Color('#eef2f7');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
    camera.position.set(20, 15, 20);
    const control = new OrbitControls(camera, randare.domElement);
    control.enableDamping = true;
    scena.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 1.6));
    const soare = new THREE.DirectionalLight('#ffffff', 1.4); soare.position.set(30, 50, 20); scena.add(soare);
    const grila = new THREE.GridHelper(200, 100, '#cbd5e1', '#e2e8f0'); grila.position.y = -0.01; scena.add(grila);

    const s: Stare = { api: null as unknown as IfcAPI, scena, camera, randare, control, grupuri: new Map(), plan: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
      cutie: new THREE.Box3(), decalaj: null, materiale: new Set(), ales: [], original: new Map() };
    st.current = s;
    const marime = () => { const w = el.clientWidth, h = el.clientHeight; randare.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(marime); ro.observe(el); marime();
    let cadru = 0;
    const bucla = () => { control.update(); randare.render(scena, camera); cadru = requestAnimationFrame(bucla); };
    bucla();

    // alegerea unui element: clic fără tragere
    let jos: { x: number; y: number } | null = null;
    const apasa = (e: PointerEvent) => { jos = { x: e.clientX, y: e.clientY }; };
    const ridica = (e: PointerEvent) => {
      if (!jos || Math.hypot(e.clientX - jos.x, e.clientY - jos.y) > 4) return;
      const r = randare.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const tinte: THREE.Object3D[] = [];
      s.grupuri.forEach(g => { if (g.grup.visible) g.grup.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) tinte.push(o); }); });
      const sec = s.materiale.size && [...s.materiale][0].clippingPlanes?.length;
      const lovit = ray.intersectObjects(tinte, false).find(h => !sec || s.plan.distanceToPoint(h.point) >= 0);
      alege(lovit ? (lovit.object as THREE.Mesh) : null);
    };
    randare.domElement.addEventListener('pointerdown', apasa);
    randare.domElement.addEventListener('pointerup', ridica);
    return () => {
      cancelAnimationFrame(cadru); ro.disconnect();
      randare.domElement.removeEventListener('pointerdown', apasa); randare.domElement.removeEventListener('pointerup', ridica);
      s.grupuri.forEach(g => { try { s.api?.CloseModel(g.modelID); } catch { /* deja închis */ } });
      randare.dispose(); el.removeChild(randare.domElement); st.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alege(m: THREE.Mesh | null) {
    const s = st.current!;
    s.ales.forEach(x => { const o = s.original.get(x); if (o) x.material = o; });
    s.ales = []; s.original.clear();
    if (!m) { setProp(null); return; }
    const { model, id } = m.userData as { model: string; id: number };
    const g = s.grupuri.get(model)!;
    const evid = new THREE.MeshLambertMaterial({ color: '#f97316', side: THREE.DoubleSide, clippingPlanes: (m.material as THREE.Material).clippingPlanes });
    g.grup.traverse(o => { const x = o as THREE.Mesh; if (x.isMesh && x.userData.id === id) { s.original.set(x, x.material as THREE.Material); x.material = evid; s.ales.push(x); } });
    proprietati(s.api, g.modelID, id).then(p => setProp({ ...p, model: model })).catch(() => setProp(null));
  }

  // încărcarea modelelor
  useEffect(() => {
    let anulat = false;
    (async () => {
      const s = st.current; if (!s) return;
      try {
        setEroare(null); setProgres('Se încarcă motorul IFC…');
        s.api = await apiIfc();
        // scoatem modelele care nu mai sunt cerute
        for (const [k, g] of s.grupuri) if (!modele.some(m => m.cheie === k)) { s.scena.remove(g.grup); s.api.CloseModel(g.modelID); s.grupuri.delete(k); }
        if (!s.grupuri.size) s.decalaj = null;
        for (const m of modele) {
          if (anulat || s.grupuri.has(m.cheie)) continue;
          setProgres(`Se deschide ${m.nume}…`);
          await new Promise(r => setTimeout(r, 20));
          // toate modelele își păstrează coordonatele reale, ca disciplinele să se suprapună;
          // scena se mută apoi în centrul primului model (coordonatele georeferențiate sunt foarte mari)
          const modelID = s.api.OpenModel(new Uint8Array(m.date), { COORDINATE_TO_ORIGIN: false });
          const grup = new THREE.Group(); grup.name = m.cheie;
          const nuanta = new THREE.Color(m.culoare);
          const mat = new Map<string, THREE.Material>();
          let n = 0;
          s.api.StreamAllMeshes(modelID, mesh => {
            const pl = mesh.geometries;
            for (let i = 0; i < pl.size(); i++) {
              const pg = pl.get(i);
              const geo = s.api.GetGeometry(modelID, pg.geometryExpressID);
              const vert = s.api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
              const idx = s.api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
              const bg = new THREE.BufferGeometry();
              const inter = new THREE.InterleavedBuffer(new Float32Array(vert), 6);
              bg.setAttribute('position', new THREE.InterleavedBufferAttribute(inter, 3, 0));
              bg.setAttribute('normal', new THREE.InterleavedBufferAttribute(inter, 3, 3));
              bg.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
              geo.delete();
              const c = pg.color;
              const cheie = `${c.x.toFixed(2)}-${c.y.toFixed(2)}-${c.z.toFixed(2)}-${c.w.toFixed(2)}`;
              let material = mat.get(cheie);
              if (!material) {
                const culoare = new THREE.Color(c.x, c.y, c.z).lerp(nuanta, 0.18);
                material = new THREE.MeshLambertMaterial({ color: culoare, transparent: c.w < 1, opacity: c.w, side: THREE.DoubleSide, depthWrite: c.w >= 1 });
                mat.set(cheie, material); s.materiale.add(material);
              }
              const me = new THREE.Mesh(bg, material);
              me.matrixAutoUpdate = false;
              me.matrix.fromArray(pg.flatTransformation);
              me.userData = { model: m.cheie, id: mesh.expressID };
              grup.add(me);
            }
            n++;
          });
          const structura = citesteStructura(s.api, modelID);
          s.grupuri.set(m.cheie, { grup, modelID, structura });
          grup.updateMatrixWorld(true);
          if (!s.decalaj) { const b = new THREE.Box3().setFromObject(grup); s.decalaj = b.isEmpty() ? new THREE.Vector3() : new THREE.Vector3(b.getCenter(new THREE.Vector3()).x, b.min.y, b.getCenter(new THREE.Vector3()).z); }
          grup.position.copy(s.decalaj).multiplyScalar(-1);
          grup.updateMatrixWorld(true);
          s.scena.add(grup);
          setIncarcate(x => [...x.filter(y => y.cheie !== m.cheie), { cheie: m.cheie, nume: m.nume, structura, elemente: n }]);
        }
        if (anulat) return;
        // încadrare și limitele secțiunii
        // încadrarea: clădirea (elementele așezate pe niveluri); dacă modelul nu are niveluri, tot
        s.cutie = new THREE.Box3();
        const tot = new THREE.Box3();
        s.grupuri.forEach(g => {
          tot.expandByObject(g.grup);
          g.grup.traverse(o => { const me = o as THREE.Mesh; if (me.isMesh && g.structura.nivelElement.has(me.userData.id)) s.cutie.expandByObject(me); });
        });
        if (s.cutie.isEmpty()) s.cutie.copy(tot);
        incadreaza();
        if (!s.cutie.isEmpty()) setSectiune(x => ({ ...x, min: s.cutie.min.y, max: s.cutie.max.y, h: x.activa ? x.h : s.cutie.max.y }));
        // același nivel din mai multe discipline = o singură bifă
        const nv = new Map<string, { nume: string; cota: number | null; chei: string[] }>();
        s.grupuri.forEach((g, k) => g.structura.niveluri.forEach(l => {
          const id = l.nume.trim().toLowerCase();
          const x = nv.get(id) ?? { nume: l.nume, cota: l.cota, chei: [] };
          x.chei.push(`${k}:${l.expressID}`); nv.set(id, x);
        }));
        setNiveluri([...nv.values()].sort((a, b) => (a.cota ?? 0) - (b.cota ?? 0)));
        setProgres(null);
      } catch (e) {
        setProgres(null);
        setEroare(`Modelul nu a putut fi deschis: ${(e as Error).message}`);
      }
    })();
    return () => { anulat = true; };
  }, [modele]);

  useEffect(() => { onIncarcate?.(incarcate); }, [incarcate, onIncarcate]);

  // vizibilitatea pe discipline și niveluri
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.grupuri.forEach((g, k) => {
      g.grup.visible = vizibile[k] !== false;
      g.grup.traverse(o => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const niv = g.structura.nivelElement.get(m.userData.id);
        m.visible = niv == null || !nivAscunse.has(`${k}:${niv}`);
      });
    });
  }, [vizibile, nivAscunse, incarcate]);

  // secțiunea orizontală
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.plan.constant = sectiune.h;
    s.materiale.forEach(m => { m.clippingPlanes = sectiune.activa ? [s.plan] : []; m.needsUpdate = true; });
    s.ales.forEach(m => { (m.material as THREE.Material).clippingPlanes = sectiune.activa ? [s.plan] : []; });
  }, [sectiune, incarcate]);

  function incadreaza() {
    const s = st.current; if (!s || s.cutie.isEmpty()) return;
    const c = s.cutie.getCenter(new THREE.Vector3());
    const r = s.cutie.getSize(new THREE.Vector3()).length() / 2;
    const d = r / Math.sin((s.camera.fov * Math.PI) / 360) * 0.9;
    s.camera.position.copy(c.clone().add(new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(d)));
    s.camera.near = Math.max(d / 1000, 0.01); s.camera.far = d * 20; s.camera.updateProjectionMatrix();
    s.control.target.copy(c); s.control.update();
  }

  const comuta = (chei: string[]) => setNivAscunse(x => { const n = new Set(x); const ascuns = chei.every(k => n.has(k)); chei.forEach(k => (ascuns ? n.delete(k) : n.add(k))); return n; });

  return (
    <div className="vizualizator">
      <div className="viz-scena" ref={gazda}>
        {progres && <div className="viz-progres">{progres}</div>}
        {eroare && <div className="viz-progres eroare">{eroare}</div>}
        <div className="viz-unelte">
          <button className="buton mic" onClick={incadreaza} title="Încadrează tot modelul">Încadrare</button>
          <button className={`buton mic ${sectiune.activa ? 'principal' : ''}`} onClick={() => setSectiune(x => ({ ...x, activa: !x.activa }))}>Secțiune</button>
        </div>
        {sectiune.activa && (
          <label className="viz-sectiune">Cota secțiunii
            <input type="range" min={sectiune.min} max={sectiune.max} step={(sectiune.max - sectiune.min) / 200 || 0.01} value={sectiune.h}
              onChange={e => setSectiune(x => ({ ...x, h: Number(e.target.value) }))} />
          </label>
        )}
      </div>
      <aside className="viz-panou">
        {incarcate.length > 0 && (
          <section>
            <h4>Discipline</h4>
            {incarcate.map(m => (
              <label key={m.cheie} className="viz-bifa">
                <input type="checkbox" checked={vizibile[m.cheie] !== false} onChange={e => setVizibile(x => ({ ...x, [m.cheie]: e.target.checked }))} />
                <span className="viz-culoare" style={{ background: modele.find(x => x.cheie === m.cheie)?.culoare }} />
                <span>{m.nume}<small>{m.structura.schema} · {m.elemente} elemente</small></span>
              </label>
            ))}
          </section>
        )}
        {niveluri.length > 0 && (
          <section>
            <h4>Niveluri</h4>
            {niveluri.map(n => (
              <label key={n.nume} className="viz-bifa">
                <input type="checkbox" checked={!n.chei.every(k => nivAscunse.has(k))} onChange={() => comuta(n.chei)} />
                <span>{n.nume}{n.cota != null && <small>cota {n.cota.toLocaleString('ro-RO')} m{n.chei.length > 1 ? ` · ${n.chei.length} discipline` : ''}</small>}</span>
              </label>
            ))}
          </section>
        )}
        <section className="viz-proprietati">
          <h4>Elementul ales</h4>
          {!prop ? <p className="discret">Dați clic pe un element din model ca să-i vedeți proprietățile.</p> : (
            <>
              <p className="viz-titlu"><b>{prop.nume}</b><small>{numeClasa(prop.clasa)} · {incarcate.find(x => x.cheie === prop.model)?.nume}</small></p>
              {prop.grupuri.map(g => (
                <details key={g.nume} open={g.nume === 'Element'}>
                  <summary>{g.nume}</summary>
                  <dl>{g.valori.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
                </details>
              ))}
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
