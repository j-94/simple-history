
// Performance optimization identified by nstar-spark
const jsonCache = new Map();

function optimizedJsonParse(jsonString, cacheKey = null) {
  if (cacheKey && jsonCache.has(cacheKey)) {
    return jsonCache.get(cacheKey);
  }
  
  const parsed = JSON.parse(jsonString);
  if (cacheKey) jsonCache.set(cacheKey, parsed);
  return parsed;
}