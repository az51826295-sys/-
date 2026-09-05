import argparse

from genesis.mission2.config import Mission2Config
from genesis.mission2.report2 import format_mission2, run_mission2, save_mission2


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.mission2")
    parser.add_argument("--seeds", type=int, default=20)
    parser.add_argument("--budget", type=float, default=None)
    parser.add_argument("--exp3", action="store_true")
    parser.add_argument("--exp4", action="store_true")
    parser.add_argument("--exp5", action="store_true")
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    config = Mission2Config()
    if args.budget is not None:
        config = config.model_copy(update={"share_budget_fraction": args.budget})
    seeds = list(range(1, args.seeds + 1))
    if args.exp5:
        from genesis.mission2.report5 import (
            format_mission5,
            run_mission5,
            save_mission5,
        )

        report5 = run_mission5(config, seeds)
        print(format_mission5(report5, config))
        if args.out:
            save_mission5(args.out, report5)
        return
    if args.exp4:
        from genesis.mission2.exp4 import (
            format_mission4,
            run_mission4,
            save_mission4,
        )

        report4 = run_mission4(config, seeds)
        print(format_mission4(report4, config))
        if args.out:
            save_mission4(args.out, report4)
        return
    if args.exp3:
        from genesis.mission2.report3 import (
            format_mission3,
            run_mission3,
            save_mission3,
        )

        report3 = run_mission3(config, seeds)
        print(format_mission3(report3, config))
        if args.out:
            save_mission3(args.out, report3)
        return
    report = run_mission2(config, seeds)
    print(format_mission2(report, config))
    if args.out:
        save_mission2(args.out, report)


main()
