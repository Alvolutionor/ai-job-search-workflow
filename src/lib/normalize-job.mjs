import { extractPublishInfo } from './date-utils.mjs';
import { parseSalary } from './salary.mjs';
import { pickFirst, pickStringArray, normalizeString } from './utils.mjs';

function optionalText(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

export function normalizeJobRecord(rawJob, { keyword, searchCity, pageNumber, collectedAtMs }) {
  const jobId = optionalText(pickFirst(rawJob, ['encryptId', 'encryptJobId', 'jobId']));
  const jobName = optionalText(pickFirst(rawJob, ['jobName', 'positionName', 'title']));
  if (!jobId || !jobName) {
    return null;
  }

  const { salaryDesc, salaryMinK, salaryMaxK, salaryMonths } = parseSalary(
    pickFirst(rawJob, ['salaryDesc', 'salary']),
  );
  const publishInfo = extractPublishInfo(rawJob, collectedAtMs);
  const skills = pickStringArray(rawJob, ['showSkills', 'skills', 'jobLabels']);
  const welfare = pickStringArray(rawJob, ['welfareList', 'welfare', 'benefits']);

  return {
    jobId,
    jobName,
    positionName: optionalText(pickFirst(rawJob, ['positionName', 'jobName', 'title'])),
    companyName: optionalText(pickFirst(rawJob, ['brandName', 'brandComInfo.brandName', 'companyName'])),
    companyId: optionalText(pickFirst(rawJob, ['encryptBrandId', 'brandComInfo.encryptBrandId', 'encryptCompanyId'])),
    bossId: optionalText(pickFirst(rawJob, ['encryptUserId', 'encryptBossId', 'bossInfo.encryptUserId'])),
    bossName: optionalText(pickFirst(rawJob, ['bossName', 'bossInfo.name'])),
    bossTitle: optionalText(pickFirst(rawJob, ['bossTitle', 'bossInfo.title'])),
    keyword,
    searchCityCode: searchCity.code,
    searchCityName: searchCity.name,
    cityName: optionalText(pickFirst(rawJob, ['cityName', 'locationName', 'city', 'addressAreaName'])) ?? searchCity.name,
    districtName: optionalText(pickFirst(rawJob, ['districtName', 'areaDistrict', 'businessDistrict'])),
    address: optionalText(pickFirst(rawJob, ['address', 'locationName', 'jobLocation'])),
    experienceName: optionalText(pickFirst(rawJob, ['experienceName', 'experience'])),
    degreeName: optionalText(pickFirst(rawJob, ['degreeName', 'degree'])),
    industryName: optionalText(pickFirst(rawJob, ['brandIndustry', 'industryName', 'brandComInfo.industry'])),
    brandStageName: optionalText(pickFirst(rawJob, ['brandStageName', 'stageName', 'brandComInfo.stageName'])),
    brandScaleName: optionalText(pickFirst(rawJob, ['brandScaleName', 'scaleName', 'brandComInfo.scaleName'])),
    jobStatusDesc: optionalText(pickFirst(rawJob, ['jobStatusDesc', 'statusDesc'])),
    activeTimeDesc: optionalText(pickFirst(rawJob, ['activeTimeDesc', 'bossActiveTimeDesc', 'bossInfo.activeTimeDesc'])),
    description: optionalText(pickFirst(rawJob, ['postDescription', 'description', 'jobDescription'])),
    skills,
    welfare,
    salaryDesc,
    salaryMinK,
    salaryMaxK,
    salaryMonths,
    publishedAtMs: publishInfo.publishedAtMs,
    publishedLabel: publishInfo.publishedLabel,
    publishedSource: publishInfo.publishedSource,
    sourcePage: pageNumber,
    jobUrl: optionalText(pickFirst(rawJob, ['jobUrl', 'url'])) ?? `https://www.zhipin.com/job_detail/${jobId}.html`,
    collectedAtMs,
    rawJson: JSON.stringify(rawJob)
  };
}
