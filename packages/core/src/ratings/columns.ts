/**
 * Rating columns, by canonical name: on the league's display scale in an export, and stored
 * on 20–80 (Knowledge Base › Ratings model › Column semantics). WE, INT and Risk are
 * ordinals, not ratings.
 */
export const RATING_COLUMNS: ReadonlySet<string> = new Set([
  'Contact P',
  'HT P',
  'K P',
  'GAP P',
  'POW P',
  'EYE P',
  'BUN',
  'BFH',
  'C ABI',
  'C FRM',
  'C ARM',
  'IF RNG',
  'IF ERR',
  'IF ARM',
  'TDP',
  'OF RNG',
  'OF ERR',
  'OF ARM',
  'SPE',
  'STE',
  'SR',
  'RUN',
  'DEF',
  'STU P',
  'MOV P',
  'HRA P',
  'PBABIP P',
  'Control P',
  'STM',
  'Hold runners',
  'DEF Pot',
]);
