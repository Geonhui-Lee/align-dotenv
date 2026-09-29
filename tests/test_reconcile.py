import unittest

from align_dotenv.parser import assignment_from_line, assignments
from align_dotenv.reconcile import align


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


if __name__ == "__main__":
    unittest.main()
