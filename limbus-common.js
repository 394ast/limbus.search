/*
 * Limbus Common Library
 *
 * 共通化する範囲:
 *   CSV (Identity / EGO) の取得・解析
 *        ↓
 *   24グループの情報作成
 *        ↓
 *   URLの img パラメータ取得・復号
 *        ↓
 *   decompressedImg
 *
 * 復元した配列を画面へ反映する処理は各HTML側で行う。
 */

const LIMBUS_COMMON_CSV_SOURCES = [
    "https://raw.githubusercontent.com/394ast/limbus.search/main/Limbus%20data%20-%20Identity.csv",
    "https://raw.githubusercontent.com/394ast/limbus.search/main/Limbus%20data%20-%20EGO.csv",
];

const LIMBUS_COMMON_GROUP_COUNT = 24;
const LIMBUS_COMMON_DEFAULT_MAX_STATE = 4;

async function loadLimbusCommonData(
    sources = LIMBUS_COMMON_CSV_SOURCES,
    defaultMaxState = LIMBUS_COMMON_DEFAULT_MAX_STATE
) {
    const responses = await Promise.all(
        sources.map(source => fetch(source))
    );

    if (responses.some(response => !response.ok)) {
        throw new Error("Limbus data CSV の取得に失敗しました。");
    }

    const csvTexts = await Promise.all(
        responses.map(response => response.text())
    );

    const csvData = csvTexts.flatMap(text => parseLimbusCommonCsv(text));
    const namelistData = normalizeLimbusCommonData(
        csvData,
        defaultMaxState
    );

    if (namelistData.length === 0) {
        throw new Error("Limbus data CSV に有効なデータがありません。");
    }

    const groupsData = Array.from(
        { length: LIMBUS_COMMON_GROUP_COUNT },
        (_, index) => {
            const groupNumber = index + 1;

            const ids = namelistData
                .filter(item => Math.floor(item.id / 1000) === groupNumber)
                .map(item => item.id)
                .sort((a, b) => a - b);

            return {
                groupNumber,
                startId: ids[0] ?? groupNumber * 1000 + 1,
                groupCount: ids.length,
            };
        }
    );

    return {
        namelistData,
        groupsData,
    };
}

function parseLimbusCommonCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === "," && !inQuotes) {
            row.push(field);
            field = "";
        } else if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && nextChar === "\n") {
                i++;
            }

            row.push(field);
            field = "";

            if (row.some(value => value !== "")) {
                rows.push(row);
            }

            row = [];
        } else {
            field += char;
        }
    }

    if (field !== "" || row.length > 0) {
        row.push(field);

        if (row.some(value => value !== "")) {
            rows.push(row);
        }
    }

    if (rows.length === 0) {
        return [];
    }

    const headers = rows[0];

    return rows.slice(1).map(values => {
        const item = {};

        headers.forEach((header, index) => {
            item[header] = values[index] ?? "";
        });

        return item;
    });
}

function normalizeLimbusCommonData(
    rawData,
    defaultMaxState = LIMBUS_COMMON_DEFAULT_MAX_STATE
) {
    const sourceArray = Array.isArray(rawData)
        ? rawData
        : Object.values(rawData ?? {});

    return sourceArray
        .map(item => ({
            id: Number(item.id),
            maxState: Number.isInteger(Number(item.maxState))
                ? Number(item.maxState)
                : defaultMaxState,
            name1: item.name1 ?? "",
            name2: item.name2 ?? "",
            season: item.season ?? "",
            rank: item.rank ?? "",
            time: item.time ?? "",
        }))
        .filter(item => Number.isInteger(item.id))
        .sort((a, b) => a.id - b.id);
}

function getLimbusImgParam() {
    const searchString = window.location.search.replace(/&amp;/g, "&");
    const urlParams = new URLSearchParams(searchString);

    return urlParams.get("img");
}

function parseLimbusImgParam(imgParam) {
    const match = imgParam.match(/^(\d+):(.*)$/);

    if (!match) {
        return {
            codingDiffId: 0,
            encodedImgData: imgParam,
        };
    }

    return {
        codingDiffId: Number(match[1]),
        encodedImgData: match[2],
    };
}

function fromLimbusUrlSafeBase64(data) {
    data = data
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while (data.length % 4) {
        data += "=";
    }

    return atob(data);
}

function runLengthDecodeLimbus(
    encodedData,
    codingDiffId = 0
) {
    const result = [];
    const countLength = codingDiffId === 1 ? 2 : 1;

    let i = 0;

    while (i < encodedData.length) {
        const count = parseInt(
            encodedData.slice(i, i + countLength),
            36
        );

        const state = encodedData[i + countLength];

        for (let j = 0; j < count; j++) {
            result.push(state);
        }

        i += countLength + 1;
    }

    return result;
}

function decompressLimbusImgData(
    encodedImgData,
    groupsData,
    codingDiffId = 0
) {
    const decodedImgData =
        fromLimbusUrlSafeBase64(encodedImgData);

    const groups = decodedImgData.split("-");
    const decompressedImg = [];

    groups.forEach((group, index) => {
        const groupData = groupsData[index];

        if (!groupData) {
            return;
        }

        const { groupCount } = groupData;
        let decoded = [];

        if (group) {
            if (group.startsWith("R")) {
                const modifiedGroup = group.slice(1);

                decoded = runLengthDecodeLimbus(
                    modifiedGroup,
                    codingDiffId
                );
            } else {
                decoded = [...group];
            }
        }

        while (decoded.length < groupCount) {
            decoded.push("0");
        }

        decoded = decoded.slice(0, groupCount);
        decompressedImg.push(...decoded);
    });

    for (let index = groups.length; index < groupsData.length; index++) {
        const { groupCount } = groupsData[index];

        for (let i = 0; i < groupCount; i++) {
            decompressedImg.push("0");
        }
    }

    return decompressedImg;
}

function decompressLimbusImgFromUrl(groupsData) {
    const imgParam = getLimbusImgParam();

    if (!imgParam) {
        return null;
    }

    const {
        codingDiffId,
        encodedImgData,
    } = parseLimbusImgParam(imgParam);

    return decompressLimbusImgData(
        encodedImgData,
        groupsData,
        codingDiffId
    );
}
