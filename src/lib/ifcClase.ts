// Numele claselor IFC, fără web-ifc: se pot folosi în pagini fără să încarce motorul IFC (câțiva MB).
/** Clasele IFC care intră în COBie ca echipamente (componente întreținute). */
export const CLASE_ECHIPAMENT = [
  'IFCAIRTERMINAL', 'IFCAIRTERMINALBOX', 'IFCAIRTOAIRHEATRECOVERY', 'IFCALARM', 'IFCAUDIOVISUALAPPLIANCE', 'IFCBOILER', 'IFCBURNER',
  'IFCCHILLER', 'IFCCOIL', 'IFCCOMMUNICATIONSAPPLIANCE', 'IFCCOMPRESSOR', 'IFCCONDENSER', 'IFCCOOLEDBEAM', 'IFCCOOLINGTOWER',
  'IFCDAMPER', 'IFCELECTRICAPPLIANCE', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCELECTRICFLOWSTORAGEDEVICE', 'IFCELECTRICGENERATOR',
  'IFCELECTRICMOTOR', 'IFCENGINE', 'IFCEVAPORATIVECOOLER', 'IFCEVAPORATOR', 'IFCFAN', 'IFCFILTER', 'IFCFIRESUPPRESSIONTERMINAL',
  'IFCFLOWMETER', 'IFCHEATEXCHANGER', 'IFCHUMIDIFIER', 'IFCINTERCEPTOR', 'IFCLAMP', 'IFCLIGHTFIXTURE', 'IFCMEDICALDEVICE',
  'IFCOUTLET', 'IFCPROTECTIVEDEVICE', 'IFCPUMP', 'IFCSANITARYTERMINAL', 'IFCSENSOR', 'IFCSOLARDEVICE', 'IFCSPACEHEATER',
  'IFCSTACKTERMINAL', 'IFCSWITCHINGDEVICE', 'IFCTANK', 'IFCTRANSFORMER', 'IFCTRANSPORTELEMENT', 'IFCTUBEBUNDLE',
  'IFCUNITARYCONTROLELEMENT', 'IFCUNITARYEQUIPMENT', 'IFCVALVE', 'IFCWASTETERMINAL',
  // IFC2x3: clasele generice
  'IFCENERGYCONVERSIONDEVICE', 'IFCFLOWTERMINAL', 'IFCFLOWMOVINGDEVICE', 'IFCFLOWCONTROLLER', 'IFCFLOWSTORAGEDEVICE', 'IFCFLOWTREATMENTDEVICE',
];

/** Denumiri în română pentru clasele frecvente. */
export const NUME_CLASE: Record<string, string> = {
  IFCWALL: 'Perete', IFCWALLSTANDARDCASE: 'Perete', IFCSLAB: 'Placă', IFCBEAM: 'Grindă', IFCCOLUMN: 'Stâlp', IFCDOOR: 'Ușă',
  IFCWINDOW: 'Fereastră', IFCSTAIR: 'Scară', IFCSTAIRFLIGHT: 'Rampă de scară', IFCRAILING: 'Balustradă', IFCROOF: 'Acoperiș',
  IFCCOVERING: 'Finisaj', IFCFOOTING: 'Fundație', IFCPILE: 'Pilot', IFCMEMBER: 'Element structural', IFCPLATE: 'Placă metalică',
  IFCCURTAINWALL: 'Perete cortină', IFCSPACE: 'Spațiu', IFCBUILDINGSTOREY: 'Nivel', IFCBUILDINGELEMENTPROXY: 'Element generic',
  IFCFURNISHINGELEMENT: 'Mobilier', IFCFURNITURE: 'Mobilier', IFCDISCRETEACCESSORY: 'Accesoriu', IFCREINFORCINGBAR: 'Bară de armătură',
  IFCAIRTERMINAL: 'Gură de aer', IFCDUCTSEGMENT: 'Tubulatură', IFCDUCTFITTING: 'Fiting tubulatură', IFCPIPESEGMENT: 'Conductă',
  IFCPIPEFITTING: 'Fiting conductă', IFCPUMP: 'Pompă', IFCFAN: 'Ventilator', IFCBOILER: 'Cazan', IFCVALVE: 'Robinet / vană',
  IFCSANITARYTERMINAL: 'Obiect sanitar', IFCLIGHTFIXTURE: 'Corp de iluminat', IFCSPACEHEATER: 'Corp de încălzire',
  IFCUNITARYEQUIPMENT: 'Echipament unitar', IFCELECTRICDISTRIBUTIONBOARD: 'Tablou electric', IFCTANK: 'Rezervor', IFCSENSOR: 'Senzor',
  IFCCABLESEGMENT: 'Cablu', IFCCABLECARRIERSEGMENT: 'Jgheab de cabluri', IFCOUTLET: 'Priză', IFCSWITCHINGDEVICE: 'Întrerupător',
  IFCDAMPER: 'Clapetă', IFCFILTER: 'Filtru', IFCCHILLER: 'Răcitor de lichid', IFCHEATEXCHANGER: 'Schimbător de căldură',
  IFCTRANSPORTELEMENT: 'Lift / scară rulantă', IFCFIRESUPPRESSIONTERMINAL: 'Sprinkler / hidrant', IFCALARM: 'Alarmă',
};
export const numeClasa = (c: string) => NUME_CLASE[c.toUpperCase()] ?? c.replace(/^IFC/i, 'Ifc');

/** Prescurtare pentru codul unui echipament fără etichetă (ex. IFCAIRTERMINAL → AT). */
export function prefixClasa(c: string) {
  const fara = c.replace(/^IFC/i, '');
  const cuv = fara.match(/[A-Z][a-z]+/g) ?? [];
  if (fara !== fara.toUpperCase() && cuv.length > 1) return cuv.map(w => w[0]).join('').slice(0, 3);
  const map: Record<string, string> = { AIRTERMINAL: 'AT', PUMP: 'PO', FAN: 'VE', BOILER: 'CZ', VALVE: 'RB', SANITARYTERMINAL: 'OS', LIGHTFIXTURE: 'IL', SPACEHEATER: 'CI', TANK: 'RZ', SENSOR: 'SZ', DAMPER: 'CL', FILTER: 'FI', CHILLER: 'RC', OUTLET: 'PR' };
  return map[fara.toUpperCase()] ?? fara.slice(0, 2).toUpperCase();
}
