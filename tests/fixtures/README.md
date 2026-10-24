# Parquet interoperability fixtures

The three `parquet-types` fixtures were generated with DuckDB 2.0.0 using GZIP, ZSTD and LZ4_RAW compression. They contain an unsigned 64-bit integer, a 38-digit decimal, a date, a timestamp with microseconds, a boolean and a null string.

Generate the GZIP fixture with this SQL, then read it and write copies with the other codecs:

```sql
COPY (
  SELECT
    18446744073709551615::UBIGINT AS unsigned_id,
    12345678901234567890.123456789012345678::DECIMAL(38,18) AS amount,
    DATE '2026-10-24' AS date,
    TIMESTAMP '2026-10-24 10:11:12.123456' AS stamp,
    true AS active,
    NULL::VARCHAR AS empty
) TO 'parquet-types.parquet' (FORMAT PARQUET, COMPRESSION GZIP);
```

The application does not depend on DuckDB. Tests use these files to check interoperability with a separate implementation.
