-- Iris, Art Director.
--
-- The first employee here whose work is invented rather than researched. Alex
-- and Emma both answer questions about the world and are judged on whether
-- their sources support what they wrote; Iris decides what something looks like,
-- and is judged on whether the decisions hold together well enough for a later
-- file to be checked against them.
--
-- Everything that makes her work differently lives in the code registries — the
-- skill, the schemas, the checks. This row only makes her appear in the
-- directory so somebody can hire her.

insert into employees (name, role, description, responsibilities, salary, status, slug)
values (
  'Iris',
  'Art Director',
  'Iris decides how something should look and writes it down so precisely that a finished file can be checked against it.',
  array[
    'Set the visual direction and write it as rules, not descriptions',
    'Name every asset the work commits to, with counts, sizes and formats',
    'Keep one accent colour meaning one thing',
    'Hand back what the brief did not decide, rather than deciding it alone'
  ],
  0,
  'available',
  'iris'
)
on conflict (slug) do update set
  name = excluded.name,
  role = excluded.role,
  description = excluded.description,
  responsibilities = excluded.responsibilities,
  status = excluded.status;
