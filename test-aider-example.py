#!/usr/bin/env python3

def calculate_total(items):
    """
    Calculate the total cost of a list of items.

    Args:
        items (list): A list of dictionaries, where each dictionary represents an item
                      and contains 'price' and 'quantity' keys.

    Returns:
        float: The total cost of all items.
    """
    total = 0
    for item in items:
        total += item['price'] * item['quantity']
    return total

def validate_items(items):
    """
    Validate that all items in the list have a non-negative price.

    Args:
        items (list): A list of dictionaries, where each dictionary represents an item
                      and contains a 'price' key.

    Returns:
        bool: True if all items have a non-negative price, False otherwise.
    """
    for item in items:
        if item['price'] < 0:
            return False
    return True

def process_order(items):
    """
    Process an order by validating the items and calculating the total cost.

    Args:
        items (list): A list of dictionaries, where each dictionary represents an item
                      and contains 'price' and 'quantity' keys.

    Returns:
        float: The total cost of the order.

    Raises:
        ValueError: If any of the items are invalid (e.g., negative price).
    """
    if not validate_items(items):
        raise ValueError("Invalid items")
    return calculate_total(items)
