import cityGroupData from '../../vendor/cityGroup.mjs';

const cityMap = new Map();

for (const group of cityGroupData?.zpData?.cityGroup ?? []) {
  for (const city of group.cityList ?? []) {
    const code = Number(city.code);
    if (!Number.isFinite(code) || cityMap.has(code)) {
      continue;
    }
    cityMap.set(code, {
      code,
      name: city.name,
      cityCode: city.cityCode ?? null,
      regionCode: city.regionCode ?? null,
      firstChar: group.firstChar,
      centerGeo: city.centerGeo ?? null
    });
  }
}

export const allCities = Array.from(cityMap.values()).sort((left, right) => left.code - right.code);

export function getCityByCode(code) {
  return cityMap.get(Number(code)) ?? null;
}

export function getCityByName(name) {
  const target = String(name ?? '').trim().toLowerCase();
  if (!target) {
    return null;
  }
  return allCities.find((city) => city.name.toLowerCase() === target) ?? null;
}
