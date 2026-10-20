-- Roteiro do evento: etapas com horário (chegada, concentração, passagem de som, apresentação…). [{ "time": "14:30", "label": "Chegada" }]
alter table public.activities add column itinerary jsonb check (itinerary is null or (jsonb_typeof(itinerary) = 'array' and jsonb_array_length(itinerary) <= 30));
