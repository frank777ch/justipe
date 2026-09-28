-- Migración manual: mantiene updated_at en el servidor para la sincronización offline.
-- Cada UPDATE fija updated_at = now(); así el cliente puede pedir "cambios desde X"
-- sin confiar en el reloj del móvil. Drizzle no modela triggers, por eso va a mano.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON "categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER debts_set_updated_at BEFORE UPDATE ON "debts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER recurring_set_updated_at BEFORE UPDATE ON "recurring" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER movements_set_updated_at BEFORE UPDATE ON "movements" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER exchange_rates_set_updated_at BEFORE UPDATE ON "exchange_rates" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER quick_amounts_set_updated_at BEFORE UPDATE ON "quick_amounts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
