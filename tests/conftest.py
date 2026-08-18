import pathlib
import sys

# Allow tests to import pipeline modules directly, e.g. `from calc_reference import ...`,
# regardless of which directory pytest is invoked from.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "pipeline"))
