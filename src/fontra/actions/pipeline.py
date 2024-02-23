from __future__ import annotations

from dataclasses import dataclass, field

from ..core.protocols import ReadableFontBackend
from .actions import (
    ConnectableActionProtocol,
    InputActionProtocol,
    OutputActionProtocol,
    getActionClass,
)
from .merger import FontBackendMerger


@dataclass(kw_only=True)
class Pipeline:
    config: dict
    steps: list[ActionStep] = field(init=False)

    def __post_init__(self):
        self.steps = _structureSteps(self.config["steps"])

    async def setupOutputs(self) -> list[OutputActionProtocol]:
        _, outputs = await _setupActionSteps(None, self.steps)
        return outputs


async def _setupActionSteps(
    currentInput: ReadableFontBackend | None, steps: list[ActionStep]
) -> tuple[ReadableFontBackend | None, list[OutputActionProtocol]]:
    outputs: list[OutputActionProtocol] = []

    for step in steps:
        actionClass = getActionClass(step.name)
        action = actionClass(**step.arguments)

        if isinstance(action, OutputActionProtocol):
            # output
            assert isinstance(action, ConnectableActionProtocol)
            assert currentInput is not None

            # set up nested steps
            outputStepsResult, moreOutput = await _setupActionSteps(
                currentInput, step.steps
            )
            outputs.extend(moreOutput)

            assert isinstance(outputStepsResult, ReadableFontBackend)
            await action.connect(outputStepsResult)
            outputs.append(action)
        elif isinstance(action, ConnectableActionProtocol):
            # filter
            assert isinstance(action, ReadableFontBackend)
            assert currentInput is not None
            await action.connect(currentInput)

            # set up nested steps
            action, moreOutput = await _setupActionSteps(action, step.steps)
            outputs.extend(moreOutput)

            currentInput = action
        elif isinstance(action, InputActionProtocol):
            # input
            action = await action.prepare()
            assert isinstance(action, ReadableFontBackend)

            # set up nested steps
            action, moreOutput = await _setupActionSteps(action, step.steps)
            outputs.extend(moreOutput)

            if currentInput is None:
                currentInput = action
            else:
                currentInput = FontBackendMerger(inputA=currentInput, inputB=action)
        else:
            raise AssertionError("Expected code to be unreachable")

    return currentInput, outputs


@dataclass(kw_only=True)
class ActionStep:
    name: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)
    action: ReadableFontBackend | ConnectableActionProtocol | OutputActionProtocol | None = field(
        init=False, default=None
    )


def _structureSteps(rawSteps):
    structured = []

    for rawStep in rawSteps:
        actionName = rawStep["action"]
        arguments = dict(rawStep)
        arguments.pop("action")
        subSteps = _structureSteps(arguments.pop("steps", []))
        structured.append(
            ActionStep(name=actionName, arguments=arguments, steps=subSteps)
        )

    return structured
