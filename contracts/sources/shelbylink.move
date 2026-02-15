module shelbylink::shelby_link_v2 {
    use std::string::{String};
    use std::signer;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_std::smart_table::{Self, SmartTable};

    // Errors
    const ENO_LINK_NOT_FOUND: u64 = 1;
    const E_ALREADY_PURCHASED: u64 = 2;
    const E_PAYMENT_FAILED: u64 = 3;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Link has key {
        creator: address,
        title: String,
        description: String,
        storage_cid: String,
        price: u64,
        buyers: SmartTable<address, bool>
    }

    /// Create a new link object
    public entry fun create_link(
        creator: &signer,
        title: String,
        description: String,
        storage_cid: String,
        price: u64
    ) {
        let creator_addr = signer::address_of(creator);
        
        let constructor_ref = object::create_object(creator_addr);
        let object_signer = object::generate_signer(&constructor_ref);

        let link = Link {
            creator: creator_addr,
            title,
            description,
            storage_cid,
            price,
            buyers: smart_table::new()
        };

        move_to(&object_signer, link);
    }

    /// Pay for access to the link content
    public entry fun pay_for_access(
        user: &signer,
        link_obj: Object<Link>
    ) acquires Link {
        let link_addr = object::object_address(&link_obj);
        assert!(exists<Link>(link_addr), ENO_LINK_NOT_FOUND);
        
        let link = borrow_global_mut<Link>(link_addr);
        let user_addr = signer::address_of(user);

        // Check if already purchased
        if (smart_table::contains(&link.buyers, user_addr)) {
             abort E_ALREADY_PURCHASED
        };

        // Transfer APT from user to creator
        coin::transfer<AptosCoin>(user, link.creator, link.price);

        // Record purchase
        smart_table::add(&mut link.buyers, user_addr, true);
    }

    /// Check if a user has access (Creator or Buyer)
    #[view]
    public fun has_access(link_obj: Object<Link>, user: address): bool acquires Link {
        let link_addr = object::object_address(&link_obj);
        if (!exists<Link>(link_addr)) {
            return false
        };
        
        let link = borrow_global<Link>(link_addr);
        
        if (link.creator == user) {
            return true
        };

        smart_table::contains(&link.buyers, user)
    }

    /// Get link details (view function)
    #[view]
    public fun get_link(link_obj: Object<Link>): (address, String, String, String, u64) acquires Link {
        let link_addr = object::object_address(&link_obj);
        if (!exists<Link>(link_addr)) {
            abort ENO_LINK_NOT_FOUND
        };
        
        let link = borrow_global<Link>(link_addr);
        (
            link.creator,
            link.title,
            link.description,
            link.storage_cid,
            link.price
        )
    }
}
