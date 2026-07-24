-- Remove duplicatas mantendo apenas o registro com menor id por (protocol_id, reference_id)
DELETE FROM protocol_references
WHERE id NOT IN (
  SELECT MIN(id)
  FROM protocol_references
  GROUP BY protocol_id, reference_id
);

-- Adiciona unique constraint para evitar duplicatas futuras
ALTER TABLE "protocol_references"
  ADD CONSTRAINT "protocol_references_protocol_id_reference_id_unique"
  UNIQUE("protocol_id","reference_id");
