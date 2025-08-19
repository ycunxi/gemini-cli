#!/usr/bin/env python3
"""
Simple test script with a deliberate bug
"""

def calculate_average(numbers):
    """Calculate the average of a list of numbers."""
    # Bug: Division by zero when list is empty
    total = sum(numbers)
    return total / len(numbers)

def main():
    # Test with normal list
    test_data = [10, 20, 30, 40, 50]
    avg = calculate_average(test_data)
    print(f"Average of {test_data}: {avg}")
    
    # This will cause an error
    empty_list = []
    avg_empty = calculate_average(empty_list)  # Bug: ZeroDivisionError
    print(f"Average of empty list: {avg_empty}")

if __name__ == "__main__":
    main()
