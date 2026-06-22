import importlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
SCRIPT = ROOT / "scripts" / "configure_school.py"


class ConfigWizardTest(unittest.TestCase):
    def test_start_asks_for_library_resource_url_first(self):
        sys.path.insert(0, str(SRC))
        try:
            wizard = importlib.import_module("wizard")
            wizard = importlib.reload(wizard)
            prompt = wizard.Wizard().start()
        finally:
            if str(SRC) in sys.path:
                sys.path.remove(str(SRC))

        self.assertIn("图书馆", prompt)
        self.assertIn("资源", prompt)
        self.assertIn("链接", prompt)
        self.assertNotIn("请问你所在的学校或单位是", prompt)

    def test_infer_whu_metaersp_portal_from_resource_url(self):
        sys.path.insert(0, str(SRC))
        try:
            wizard = importlib.import_module("wizard")
            wizard = importlib.reload(wizard)
            result = wizard.infer_access_from_url("https://whu.metaersp.cn/personalIndex")
        finally:
            if str(SRC) in sys.path:
                sys.path.remove(str(SRC))

        self.assertEqual(result["entry_type"], "resource_portal")
        self.assertEqual(result["auth_type"], "cas")
        self.assertEqual(result["sso_domain"], "cas.whu.edu.cn")
        self.assertEqual(result["resource_entry"], "https://whu.metaersp.cn/personalIndex")
        self.assertEqual(result["institution_hint"], "whu")

    def test_infer_cas_login_service_callback_from_resource_url(self):
        sys.path.insert(0, str(SRC))
        try:
            wizard = importlib.import_module("wizard")
            wizard = importlib.reload(wizard)
            result = wizard.infer_access_from_url(
                "https://cas.whu.edu.cn/authserver/login?service=http%3A%2F%2Fuas.metaauth.com%2Fcasservice%2Fwhu%2FserviceValidate"
            )
        finally:
            if str(SRC) in sys.path:
                sys.path.remove(str(SRC))

        self.assertEqual(result["entry_type"], "cas_login")
        self.assertEqual(result["auth_type"], "cas")
        self.assertEqual(result["sso_domain"], "cas.whu.edu.cn")
        self.assertEqual(result["service_host"], "uas.metaauth.com")
        self.assertEqual(result["institution_hint"], "whu")

    def test_resource_url_flow_can_save_schema_valid_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_env = os.environ.copy()
            os.environ["LIT_DL_CONFIG_DIR"] = tmp
            sys.path.insert(0, str(SRC))
            try:
                config = importlib.import_module("config")
                wizard = importlib.import_module("wizard")
                config = importlib.reload(config)
                wizard = importlib.reload(wizard)
                w = wizard.Wizard()
                w.handle_step1("https://whu.metaersp.cn/personalIndex")
                result = w.handle_step7("1")

                self.assertEqual(result["next"], "done")
                saved = Path(result["data"]["path"])
                data = json.loads(saved.read_text(encoding="utf-8"))
                self.assertEqual(data["school"]["source"], "resource_url")
                self.assertEqual(data["auth"]["sso_domain"], "cas.whu.edu.cn")
                self.assertEqual(data["discovery"]["resource_portal_url"], "https://whu.metaersp.cn/personalIndex")
            finally:
                if str(SRC) in sys.path:
                    sys.path.remove(str(SRC))
                os.environ.clear()
                os.environ.update(old_env)

    def test_preset_configuration_uses_temp_config_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_env = os.environ.copy()
            os.environ["LIT_DL_CONFIG_DIR"] = tmp
            sys.path.insert(0, str(SRC))
            try:
                config = importlib.import_module("config")
                wizard = importlib.import_module("wizard")
                config = importlib.reload(config)
                wizard = importlib.reload(wizard)

                result = wizard.Wizard().configure_from_preset("交大")
                saved = Path(result["path"])

                self.assertEqual(saved.parent, Path(tmp))
                self.assertTrue(saved.exists())
                self.assertEqual(saved.stat().st_mode & 0o777, 0o600)
                data = json.loads(saved.read_text(encoding="utf-8"))
                self.assertEqual(data["school"]["name"], "上海交通大学")
                self.assertEqual(data["auth"]["sso_domain"], "jaccount.sjtu.edu.cn")
                self.assertEqual(data["auth"]["carsi_entry"], "https://jaccount.sjtu.edu.cn/")
            finally:
                if str(SRC) in sys.path:
                    sys.path.remove(str(SRC))
                os.environ.clear()
                os.environ.update(old_env)

    def test_sjtu_preset_does_not_use_parameterless_oauth_login(self):
        sys.path.insert(0, str(SRC))
        try:
            schools_loader = importlib.import_module("schools_loader")
            schools_loader = importlib.reload(schools_loader)
            preset = schools_loader.match_school("上海交通大学")
        finally:
            if str(SRC) in sys.path:
                sys.path.remove(str(SRC))

        self.assertIsNotNone(preset)
        self.assertNotEqual(preset["auth"]["carsi_entry"], "https://jaccount.sjtu.edu.cn/oauth2/login")

    def test_cli_show_reports_missing_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = os.environ.copy()
            env["LIT_DL_CONFIG_DIR"] = tmp
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "show"],
                cwd=ROOT,
                env=env,
                text=True,
                capture_output=True,
            )

        self.assertEqual(result.returncode, 2)
        self.assertIn("尚未配置", result.stdout)

    def test_cli_url_configures_from_resource_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = os.environ.copy()
            env["LIT_DL_CONFIG_DIR"] = tmp
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "url", "https://whu.metaersp.cn/personalIndex"],
                cwd=ROOT,
                env=env,
                text=True,
                capture_output=True,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertTrue(data["ok"])
        self.assertEqual(data["entry_type"], "resource_portal")
        self.assertEqual(data["sso_domain"], "cas.whu.edu.cn")

    def test_cli_infer_does_not_save_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = os.environ.copy()
            env["LIT_DL_CONFIG_DIR"] = tmp
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "infer", "https://whu.metaersp.cn/personalIndex"],
                cwd=ROOT,
                env=env,
                text=True,
                capture_output=True,
            )

            self.assertFalse((Path(tmp) / "school.json").exists())

        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["entry_type"], "resource_portal")


if __name__ == "__main__":
    unittest.main()
