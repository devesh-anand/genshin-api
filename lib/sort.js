/**
 * Sorts an array of { slug, data } objects by a field on data.
 * Nulls always sort last regardless of direction.
 *
 * @param {Array<{slug:string, data:object}>} results
 * @param {string|null} dataField - Key on data to sort by (null = no-op)
 * @param {'asc'|'desc'} order
 */
export function sortResults(results, dataField, order = 'asc') {
   if (!dataField) return results;
   const dir = order === 'desc' ? -1 : 1;
   return [...results].sort((a, b) => {
      const av = a.data[dataField];
      const bv = b.data[dataField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
   });
}
