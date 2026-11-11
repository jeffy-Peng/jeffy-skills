"""Verify that Catalog rejects incomplete future material registrations."""
from pathlib import Path
import copy,json,importlib.util,tempfile
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('catalog_builder',ROOT/'scripts/build-catalog.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
base=json.loads((ROOT/'assets/catalog.json').read_text(encoding='utf-8'));result=[]
module.validate_catalog(base)
for name,mutate in [
 ('missing-standard',lambda e:e.pop('standard')),
 ('missing-rationale',lambda e:e['sheets'][0].pop('rationale')),
 ('missing-source',lambda e:e.update(sources=[])),
 ('missing-boundary',lambda e:e.pop('limits')),
 ('missing-verification-scope',lambda e:e.pop('standardCoverage')),
 ('implementation-as-template',lambda e:e.update(implementationRole='template')),
 ('missing-resource',lambda e:e.update(standard='not-existing-standard.md'))]:
 data=copy.deepcopy(base);mutate(data['entries'][0]);rejected=False
 try:module.validate_catalog(data)
 except ValueError:rejected=True
 assert rejected,name
 result.append({'case':name,'rejected':True})
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);(root/'empty.md').write_text('# Empty standard',encoding='utf-8');data=copy.deepcopy(base);data['entries'][0]['standard']=str(root/'empty.md');rejected=False
 try:module.validate_catalog(data)
 except ValueError:rejected=True
 assert rejected;result.append({'case':'empty-standard','rejected':True})
# Never promote a draft merely because its normative files exist.
draft=copy.deepcopy(base);draft['entries'][0]['status']='草稿·未入库';draft['entries'][0]['evidence']=[];module.validate_catalog(draft);assert draft['entries'][0]['status']=='草稿·未入库'
result.append({'case':'unverified-draft-keeps-status','pass':True})
out=ROOT/'build/reports/catalog-contract.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'coverage':module.validate_catalog(base),'cases':result,'scope':'资源契约与规则章节检查；不证明内容语义或模型行为正确'},ensure_ascii=False,indent=2),encoding='utf-8');print(f"{len(base['entries'])} material contracts and {len(result)} registration cases passed")
