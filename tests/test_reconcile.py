import unittest

from align_dotenv.parser import assignment_from_line, assignments
from align_dotenv.reconcile import UnknownKeysError, align, reconcile


class ReconcileTests(unittest.TestCase):
    def test_template_layout_local_values_and_state(self):
        template = "# Required setting.\nREQUIRED=template\n\n# OPTIONAL=template\n"
        local = "OPTIONAL='kept value'\nREQUIRED= live=value\n"
        expected = "# Required setting.\nREQUIRED= live=value\n\nOPTIONAL='kept value'\n"
        self.assertEqual(align(template, local), expected)

    def test_unknown_variables_are_kept_without_values_in_template(self):
        template = "KNOWN=default\n"
        local = "KNOWN=local\n# EXTRA='private'\nOTHER=secret\n"
        expected = "KNOWN=local\n\n# EXTRA='private'\nOTHER=secret\n"
        self.assertEqual(align(template, local), expected)
        self.assertEqual(align(template, expected), expected)

    def test_raw_values_and_export_prefix(self):
        template = "VALUE=x\nexport TOKEN=x\nURL=x\n"
        local = 'VALUE="abc # def"\nTOKEN=\'some complex value\'\nURL=https://example.com?a=b&c=d\n'
        expected = 'VALUE="abc # def"\nexport TOKEN=\'some complex value\'\nURL=https://example.com?a=b&c=d\n'
        self.assertEqual(align(template, local), expected)

    def test_commented_local_assignment_remains_commented(self):
        self.assertEqual(align("  export KEY=default\n", "# export KEY=kept\n"),
                         "# export KEY=kept\n")
        self.assertEqual(align("  # export KEY=default\n", "export KEY=kept\n"),
                         "  export KEY=kept\n")

    def test_last_duplicate_assignment_wins(self):
        self.assertEqual(align("A=default\n", "A=first\n# A=last\n"), "# A=last\n")
        self.assertEqual(assignments(["A=first\n", "A=last\n"])["A"].value, "last")

    def test_supported_syntax_and_unrecognized_lines(self):
        for line in ("KEY=value\n", "export KEY=value\n", "# KEY=value\n",
                     "# export KEY=value\n"):
            self.assertEqual(assignment_from_line(line).key, "KEY")
        self.assertIsNone(assignment_from_line("INVALID-KEY=value\n"))
        self.assertEqual(align("# Heading\nINVALID-KEY=value\nNEW=default\n", ""),
                         "# Heading\nINVALID-KEY=value\nNEW=default\n")

    def test_unknown_after_template_without_final_newline(self):
        expected = "KEY=local\n\nEXTRA=secret"
        self.assertEqual(align("KEY=default", "KEY=local\nEXTRA=secret"), expected)
        self.assertEqual(align("KEY=default", expected), expected)

    def test_template_crlf_is_not_changed(self):
        self.assertEqual(align("# Head\r\nKEY=default\r\n", "KEY=kept\n"),
                         "# Head\r\nKEY=kept\r\n")

    def test_line_endings_follow_template_for_known_keys(self):
        for ending in ("\n", "\r\n"):
            template = f"# Comment{ending}A=default{ending}"
            local = "A=secret\r\n" if ending == "\n" else "A=secret\n"
            expected = f"# Comment{ending}A=secret{ending}"
            self.assertEqual(align(template, local), expected)
            self.assertEqual(align(template, expected), expected)

    def test_final_newline_follows_template(self):
        for template in ("A=default", "A=default\n", "A=default\r\n"):
            for local in ("A=1", "A=1\n", "A=1\r\n"):
                result = align(template, local)
                self.assertEqual(result, template.replace("default", "1"))
                self.assertEqual(align(template, result), result)

    def test_empty_values_and_raw_special_characters(self):
        template = "EMPTY=x\nexport EXPORTED=x\nHASH=x\nEQUALS=x\nURL=x\nSPACES=x\nQUOTED=x\n"
        local = ('EMPTY=\nexport EXPORTED=\nHASH="abc # def"\nEQUALS=a=b=c\n'
                 "URL=https://example.com?a=b&c=d\nSPACES='hello world'\nQUOTED=\"\"\n")
        self.assertEqual(align(template, local), local)

    def test_unicode_comments_and_values(self):
        template = '# 데이터베이스 설정\nMESSAGE=default\nEMOJI=default\n'
        local = 'EMOJI="🚀"\nMESSAGE="안녕하세요"\n'
        result = '# 데이터베이스 설정\nMESSAGE="안녕하세요"\nEMOJI="🚀"\n'
        self.assertEqual(align(template, local), result)

    def test_export_and_comment_state_transitions(self):
        self.assertEqual(align("# FEATURE=true\n", "FEATURE=false\n"), "FEATURE=false\n")
        self.assertEqual(align("FEATURE=true\n", "# FEATURE=false\n"), "# FEATURE=false\n")
        self.assertEqual(align("# export OPTIONAL=default\nexport API_KEY=default\n",
                               "export OPTIONAL=private\n# export API_KEY=private\n"),
                         "export OPTIONAL=private\n# export API_KEY=private\n")

    def test_duplicate_keys_choose_final_value_and_state(self):
        template = "TOKEN=default\n"
        for local, expected in (("TOKEN=old\nTOKEN=new\n", "TOKEN=new\n"),
                                ("TOKEN=old\n# TOKEN=new\n", "# TOKEN=new\n")):
            self.assertEqual(align(template, local), expected)
            self.assertEqual(align(template, expected), expected)

    def test_unknown_policies_only_use_names_for_error(self):
        template = "KNOWN=default\n"
        local = "Z=secret-z\nKNOWN=secret-k\n# A=secret-a\n"
        self.assertEqual(align(template, local),
                         "KNOWN=secret-k\n\nZ=secret-z\n# A=secret-a\n")
        self.assertEqual(align(template, local, "remove"), "KNOWN=secret-k\n")
        result = reconcile(template, local)
        self.assertEqual(result.unknown_keys, ("A", "Z"))
        with self.assertRaises(UnknownKeysError) as caught:
            reconcile(template, local, "error")
        self.assertEqual(caught.exception.keys, ("A", "Z"))
        self.assertNotIn("secret", str(caught.exception))

    def test_unknown_policy_rejects_invalid_input(self):
        with self.assertRaises(ValueError):
            align("A=default\n", "A=local\n", "invalid")


if __name__ == "__main__":
    unittest.main()
