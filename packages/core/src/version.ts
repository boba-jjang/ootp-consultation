/**
 * Version of the import rules. Every imported file is stamped with it, so re-reading
 * stored raw files is deterministic. Bump it whenever an import rule changes.
 */
export const IMPORTER_VERSION = '0.4.0';

// 0.1.0: header detection, cell parsing, routing and snapshot validation.
// 0.2.0: any CSV read through the column dictionary, files merged cell by cell into four tables.
// 0.3.0: a later blank never replaces a value; coverage counts data sets by key columns.
// 0.4.0: the fielding view's columns and file rule (rows by POS, counts kept apart); TM as the short code, Seattle as SEA.
