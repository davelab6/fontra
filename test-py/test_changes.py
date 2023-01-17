from copy import deepcopy
import json
import pathlib
import pytest
from fontra.core.changes import (
    applyChange,
    collectChangePaths,
    filterChangePattern,
    patternDifference,
    patternFromPath,
    patternIntersect,
    patternUnion,
    matchChangePattern,
)


def getTestData(fileName):
    path = pathlib.Path(__file__).parent.parent / "test-common" / fileName
    return json.loads(path.read_text(encoding="utf-8"))


applyChangeTestData = getTestData("apply-change-test-data.json")
applyChangeTestInputData = applyChangeTestData["inputData"]


applyChangeTestData = [
    (
        testCase["testName"],
        testCase["inputDataName"],
        testCase["change"],
        testCase["expectedData"],
    )
    for testCase in applyChangeTestData["tests"]
]


@pytest.mark.parametrize(
    "testName, inputDataName, change, expectedData", applyChangeTestData
)
def test_applyChange(testName, inputDataName, change, expectedData):
    subject = deepcopy(applyChangeTestInputData[inputDataName])
    applyChange(subject, change)
    assert subject == expectedData


@pytest.mark.parametrize(
    "patternA, path, expectedPattern",
    [
        ({}, [], {}),
        ({"A": None}, [], {"A": None}),
        ({}, ["A"], {"A": None}),
        ({}, ["A", "B"], {"A": {"B": None}}),
        ({"A": None}, ["A"], {"A": None}),
        ({"A": None}, ["A", "B"], {"A": None}),
        ({"A": None}, ["B", "C"], {"A": None, "B": {"C": None}}),
        ({"A": {"B": None}}, ["A"], {"A": None}),
    ],
)
def test_addPathToPattern(patternA, path, expectedPattern):
    patternB = patternFromPath(path)
    orgPattern = deepcopy(patternA)
    newPattern = patternUnion(patternA, patternB)
    assert orgPattern == patternA
    assert expectedPattern == newPattern


@pytest.mark.parametrize(
    "patternA, path, expectedPattern",
    [
        ({"A": None}, ["A"], {}),
        ({"A": {"B": None}}, ["A", "B"], {}),
        ({"A": None}, ["A", "B"], {"A": None}),
        ({"A": None, "B": {"C": None}}, ["B", "C"], {"A": None}),
        ({"A": {"B": None}}, ["A"], {}),
    ],
)
def test_subtractPathFromPattern(patternA, path, expectedPattern):
    patternB = patternFromPath(path)
    orgPattern = deepcopy(patternA)
    newPattern = patternDifference(patternA, patternB)
    assert orgPattern == patternA
    assert expectedPattern == newPattern


@pytest.mark.parametrize(
    "pattern, patternToAdd, expectedPattern",
    [
        ({}, {}, {}),
        ({"a": None}, {}, {"a": None}),
        ({}, {"b": None}, {"b": None}),
        ({"a": None}, {"b": None}, {"a": None, "b": None}),
        ({"a": None}, {"a": {"b": None}}, {"a": None}),
        ({"a": {"b": None}}, {"a": None}, {"a": None}),
        ({"a": {"b": None}}, {"a": {"b": {"c": None}}}, {"a": {"b": None}}),
        ({"a": {"b": {"c": None}}}, {"a": {"b": None}}, {"a": {"b": None}}),
        ({"a": {"b": None}}, {"a": {"c": None}}, {"a": {"b": None, "c": None}}),
    ],
)
def test_addPatternToPattern(pattern, patternToAdd, expectedPattern):
    orgPattern = deepcopy(pattern)
    newPattern = patternUnion(pattern, patternToAdd)
    assert orgPattern == pattern
    assert expectedPattern == newPattern


@pytest.mark.parametrize(
    "pattern, patternToRemove, expectedPattern",
    [
        ({}, {}, {}),
        ({"a": None}, {"a": None}, {}),
        ({}, {"b": None}, {}),
        ({"a": None}, {"b": None}, {"a": None}),
        ({"a": None, "b": None}, {"a": None}, {"b": None}),
        ({"a": None}, {"a": {"b": None}}, {"a": None}),
        ({"a": None}, {"a": {"b": {"c": None}}}, {"a": None}),
        ({"a": {"b": None}}, {"a": None}, {}),
        ({"a": {"b": None}}, {"a": {"b": {"c": None}}}, {"a": {"b": None}}),
        ({"a": {"b": {"c": None}}}, {"a": {"b": {"c": None}}}, {}),
        ({"a": {"b": {"c": None}}}, {"a": {"b": None}}, {}),
        ({"a": {"b": {"c": None}}}, {"a": None}, {}),
        ({"a": {"b": None, "c": None}}, {"a": {"c": None}}, {"a": {"b": None}}),
    ],
)
def test_subtractPatternFromPattern(pattern, patternToRemove, expectedPattern):
    orgPattern = deepcopy(pattern)
    newPattern = patternDifference(pattern, patternToRemove)
    assert orgPattern == pattern
    assert expectedPattern == newPattern


@pytest.mark.parametrize(
    "patternA, patternB, expectedPattern",
    [
        ({}, {}, {}),
        ({"A": None}, {}, {}),
        ({}, {"A": None}, {}),
        ({"A": None}, {"B": None}, {}),
        ({"A": None}, {"A": None}, {"A": None}),
        ({"A": None, "B": None}, {"A": None}, {"A": None}),
        ({"A": None}, {"A": None, "B": None}, {"A": None}),
        ({"A": {"X": None}}, {"A": {"X": None}}, {"A": {"X": None}}),
        ({"A": {"X": None}}, {"A": {"Y": None}}, {}),
        ({"A": {"X": None}}, {"A": {"X": None, "Y": None}}, {"A": {"X": None}}),
        (
            {"A": {"B": {"X": None}}},
            {"A": {"B": {"X": None}}},
            {"A": {"B": {"X": None}}},
        ),
        ({"A": {"B": {"X": None}}}, {"A": {"B": {"Y": None}}}, {}),
        (
            {"A": {"B": {"X": None, "Y": None}}},
            {"A": {"B": {"X": None}}},
            {"A": {"B": {"X": None}}},
        ),
        (
            {"A": {"B": {"X": None}}},
            {"A": {"B": {"X": None, "Y": None}}},
            {"A": {"B": {"X": None}}},
        ),
    ],
)
def test_patternIntersect(patternA, patternB, expectedPattern):
    pattern = patternIntersect(patternA, patternB)
    assert expectedPattern == pattern


@pytest.mark.parametrize(
    "change, pattern, expectedResult",
    getTestData("match-change-pattern-test-data.json"),
)
def test_matchChangePattern(change, pattern, expectedResult):
    result = matchChangePattern(change, pattern)
    assert expectedResult == result


@pytest.mark.parametrize(
    "change, pattern, expectedResult",
    [
        (
            {},
            {},
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": None, "B": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A"], "f": "*", "c": [{}]},
            {"A": None},
            {"p": ["A"], "f": "*", "c": [{}]},
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": {"B": None}},
            None,
        ),
        (
            {"p": ["A", "B"], "f": "*"},
            {"A": None},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A", "B"], "f": "*"},
            {"A": {"B": None}},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A"], "f": "*"},
            {"B": None},
            None,
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}], "f": "!"},
            {"A": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}]},
            {"A": {"B": None}},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"]}]},
            {"A": {"C": None}},
            None,
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"]}]},
            {"B": {"B": None}},
            None,
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"A": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"B": None},
            {"p": ["B"], "f": "!"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"C": None},
            None,
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"B": None}},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"C": None}},
            {"p": ["A", "C"], "f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"D": None}},
            None,
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"B": None, "C": None}},
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
        ),
    ],
)
def test_filterChangePattern(change, pattern, expectedResult):
    result = filterChangePattern(change, pattern)
    assert expectedResult == result


@pytest.mark.parametrize(
    "change, pattern, expectedResult",
    [
        (
            {},
            {},
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": None},
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": None, "B": None},
            None,
        ),
        (
            {"p": ["A"], "f": "*", "c": [{}]},
            {"A": None},
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": {"B": None}},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A", "B"], "f": "*"},
            {"A": None},
            None,
        ),
        (
            {"p": ["A", "B"], "f": "*"},
            {"A": {"B": None}},
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"B": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}], "f": "!"},
            {"A": None},
            {"f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}], "f": "!"},
            {"A": {"B": None}},
            {"p": ["A"], "f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}], "f": "!"},
            {"A": {"C": None}},
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}], "f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"]}]},
            {"B": {"B": None}},
            {"p": ["A"], "c": [{"p": ["B"]}]},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"A": None},
            {"p": ["B"], "f": "!"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"B": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"C": None},
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"B": None}},
            {"p": ["A", "C"], "f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"C": None}},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"D": None}},
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
        ),
        (
            {
                "p": ["A"],
                "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}],
                "f": "*",
            },
            {"A": {"B": None, "C": None}},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"B": None, "C": None}},
            None,
        ),
    ],
)
def test_filterChangePattern_inverse(change, pattern, expectedResult):
    result = filterChangePattern(change, pattern, inverse=True)
    assert expectedResult == result


@pytest.mark.parametrize(
    "change, depth, expectedPaths",
    getTestData("collect-change-paths-test-data.json"),
)
def test_collectChangePaths(change, depth, expectedPaths):
    paths = collectChangePaths(change, depth)
    expectedPaths = [tuple(p) for p in expectedPaths]
    assert expectedPaths == paths


@pytest.mark.parametrize(
    "path, expectedPattern",
    [
        ([], {}),
        (["a"], {"a": None}),
        (["a", "b"], {"a": {"b": None}}),
        (["a", "b", "c"], {"a": {"b": {"c": None}}}),
    ],
)
def test_patternFromPath(path, expectedPattern):
    pattern = patternFromPath(path)
    assert expectedPattern == pattern
