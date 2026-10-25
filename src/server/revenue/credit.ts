/**
 * Which visit gets credit for a charge: the buyer's most recent visit that had a real source
 * (last non-direct touch), or their latest visit if every visit was direct.
 * "Clicked a tweet, came back by typing the URL two weeks later, paid" -> credited to the tweet.
 *
 * Binds: ?1 property_id, ?2 uid, ?3 latest allowed visit start (ms).
 */
export const CREDITED_VISIT_SQL = `
  SELECT vsn FROM visits
  WHERE property_id = ?1 AND uid = ?2 AND began <= ?3
  ORDER BY CASE WHEN channel = 'Direct' THEN 1 ELSE 0 END, began DESC
  LIMIT 1`;

/** Allow the credited visit to start up to a minute after the charge (clock skew, webhook first). */
export const CREDIT_GRACE_MS = 60_000;
