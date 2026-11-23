-- SEG-11 (restante): pg_net saía do schema public (a extensão não é relocável, então foi recriada).
-- Nenhum agendamento nem função do public usava pg_net (conferido antes).
drop extension pg_net;
create extension pg_net with schema extensions;
