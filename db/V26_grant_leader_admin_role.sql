-- V26: keep already-assigned administrators active without coupling
-- authorization to a mutable display name or a committed personal identity.

update public.players
set status = 'active'
where role = 'admin'
  and status is distinct from 'active';
